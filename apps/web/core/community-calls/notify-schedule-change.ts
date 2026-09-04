import { Effect } from 'effect';

import { getEntity } from '~/core/io/queries';

import { notifyCommunityCallUpdate } from './api';
import { CALL_SCHEMA } from './constants';

/**
 * How long to wait for the indexer to catch up before giving up on notifying (GEO-2817).
 *
 * Sized against the indexing latency we actually measure on entity writes — p50 9.9s,
 * p95 48.6s — with headroom, because giving up early is the expensive outcome: it leaves
 * subscribers holding the old time.
 */
export const INDEXED_SCHEDULE_TIMEOUT_MS = 120_000;
export const INDEXED_SCHEDULE_POLL_MS = 3_000;

export type NotifyScheduleChangeResult =
  /** curator-backend accepted the resend. */
  | { status: 'notified' }
  /** No identity token, so we never called. Subscribers still hold the old time. */
  | { status: 'skipped-no-token' }
  /** The indexer never caught up. Deliberately did not notify — see below. */
  | { status: 'timed-out'; lastSeen: string | null }
  /** curator-backend rejected the resend, or the network failed. */
  | { status: 'failed'; error: unknown };

type Deps = {
  spaceId: string;
  callId: string;
  /** The schedule this save just wrote. */
  next: string;
  /** The schedule the call had before this save. */
  previous: string;
  getToken: () => Promise<string | null>;
  /** Injectable for tests. Reads the schedule the indexer currently reports. */
  readIndexedSchedule?: (spaceId: string, callId: string) => Promise<string | null>;
  notify?: (args: { spaceId: string; callId: string }, token: string) => Promise<unknown>;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  timeoutMs?: number;
  pollMs?: number;
};

async function readScheduleFromIndexer(spaceId: string, callId: string): Promise<string | null> {
  const entity = await Effect.runPromise(getEntity(callId, spaceId));
  return entity?.values.find(v => v.property.id === CALL_SCHEMA.MEETING_TIME_PROPERTY)?.value ?? null;
}

const defaultSleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

/**
 * Resend calendar invites for a call whose series was just edited — but only once the
 * indexer agrees the new schedule is there (GEO-2817).
 *
 * curator-backend does not take the new time from us; its `notify-update` handler reads the
 * call back through `Entity.findOnePublic` and builds the iMIP from whatever the indexer
 * reports. That read-back is deliberate — the endpoint authenticates the caller but does not
 * check they may edit the space, so trusting a client-supplied time would let any signed-in
 * user mail arbitrary reschedules to a call's subscribers. It does mean the notification is
 * only correct once indexing has caught up.
 *
 * The old call site fired from `makeProposal`'s `onSuccess`, which resolves on the
 * user-operation receipt — chain confirmation, not indexing. Notifying in that window resends
 * the **old** time with an incremented SEQUENCE, so the subscriber's calendar accepts a
 * revision that changes nothing and, since nothing fires again, stays wrong permanently.
 *
 * Hence: wait, and on timeout do **not** notify. A missed resend leaves the old time in place
 * and can be retried; a resend of the old time burns the sequence number that a later correct
 * resend would need in order to win.
 */
export async function notifyScheduleChange(deps: Deps): Promise<NotifyScheduleChangeResult> {
  const {
    spaceId,
    callId,
    next,
    previous,
    getToken,
    readIndexedSchedule = readScheduleFromIndexer,
    notify = notifyCommunityCallUpdate,
    sleep = defaultSleep,
    now = Date.now,
    timeoutMs = INDEXED_SCHEDULE_TIMEOUT_MS,
    pollMs = INDEXED_SCHEDULE_POLL_MS,
  } = deps;

  const send = async (): Promise<NotifyScheduleChangeResult> => {
    const token = await getToken();
    if (!token) return { status: 'skipped-no-token' };

    try {
      await notify({ spaceId, callId }, token);
      return { status: 'notified' };
    } catch (error) {
      return { status: 'failed', error };
    }
  };

  // An edit that left the time alone — a rename, or a change to auto-publish — has nothing to
  // wait for: whatever the indexer reports is already the time we want the invite to carry.
  // The invite still carries the title, so it is worth resending.
  if (next === previous) {
    return send();
  }

  const deadline = now() + timeoutMs;
  let lastSeen: string | null = null;

  for (;;) {
    try {
      lastSeen = await readIndexedSchedule(spaceId, callId);
      if (lastSeen === next) return send();
    } catch {
      // A failed read is indistinguishable from "not yet" as far as the decision here goes,
      // so keep polling and let the deadline end it.
    }

    if (now() >= deadline) return { status: 'timed-out', lastSeen };
    await sleep(pollMs);
  }
}
