'use client';

import { type Query, useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import type { EntityResponseIndexingState } from '~/core/hooks/use-entity-vote';
import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';

import {
  type DebateResponseKind,
  GeoChatRequestError,
  type GetPrivyIdentityToken,
  notifyClaimResponseIndexed,
} from './api';
import { refreshRematchClaimBatches, rematchClaimBatchesWithClaim } from './rematch-claims-query-key';

/** Wait after a 429 that carries no `Retry-After`. */
const RATE_LIMITED_RETRY_MS = 5_000;
/** Attempts after a 429 before a report is dropped. */
const MAX_RATE_LIMITED_RETRIES = 3;

/**
 * Every query whose answer a position write changes, as key prefixes (GEO-2814).
 *
 * These are the three sources the Request debate control reads geo-chat's copy of the position
 * from — Explore's per-space claims, the hub's Claims tab, and the hub's Matches tab. They ask the
 * same question of the same service and are keyed independently, so a refresh has to name all
 * three. Prefixes, because the full keys carry a claim-id batch and a filter set respectively,
 * neither of which is reconstructable from a notification.
 *
 * `matches` is included because a new position can create or dissolve a match outright, not merely
 * change how one renders.
 */
function readinessQueryPrefixes(accountKey: string, spaceId: string) {
  return [
    // Explore cards and the claim page: ['debates', 'claims', spaceId, claimIds, accountKey]
    ['debates', 'claims', spaceId],
    // Hub Claims tab: ['debates', 'account', accountKey, 'matchmaking-claims', filters]
    ['debates', 'account', accountKey, 'matchmaking-claims'],
    // Hub Matches tab: ['debates', 'account', accountKey, 'matches']
    ['debates', 'account', accountKey, 'matches'],
  ] as const;
}
/** Fields shared by pending and indexed response notifications. */
type NotifiableClaimResponse = Pick<
  NonNullable<ReturnType<typeof pendingClaimResponse>>,
  'entityId' | 'position' | 'responseKind' | 'spaceId'
>;
type ClaimReport = {
  /** One account, claim, space and response kind. */
  laneKey: string;
  notificationKey: string;
  response: NotifiableClaimResponse;
  /** The account the report was queued under. It is never sent while another account is active. */
  accountKey: string;
  getPrivyIdentityToken: GetPrivyIdentityToken;
};
type ReportLane = {
  accountKey: string;
  inFlight: AbortController | null;
  /** The newest report that arrived while the lane was busy; it supersedes any older one. */
  waiting: ClaimReport | null;
  retryTimer: ReturnType<typeof setTimeout> | null;
  rateLimitedRetries: number;
  /** The last report accepted into this lane. A repeat of it is the same run firing again. */
  lastKey: string | null;
  /** The report `rateLimitedRetries` counts for; each report gets its own retry budget. */
  retrying: string | null;
};

export function claimResponseIndexedEvent(queryKey: readonly unknown[], data: unknown) {
  const [scope, , entityId, spaceId, responseKind] = queryKey;
  const indexingState = data as EntityResponseIndexingState | undefined;
  if (
    scope !== 'entity-response-indexing' ||
    indexingState?.status !== 'indexed' ||
    !indexingState.pending ||
    (responseKind !== 'stance' && responseKind !== 'veracity')
  ) {
    return null;
  }
  return {
    entityId: String(entityId),
    position:
      indexingState.pending.expectedResponse === null ? null : indexingState.pending.expectedResponse === 'positive',
    responseKind: responseKind as DebateResponseKind,
    runId: indexingState.runId,
    spaceId: String(spaceId),
  };
}

/**
 * The same parse as {@link claimResponseIndexedEvent}, but for a response that is still *in
 * flight* rather than one the indexer has confirmed (GEO-2784).
 *
 * `claimResponseIndexedEvent` deliberately waits for `status === 'indexed'`, because its job is to
 * tell geo-chat something true. This one exists for the opposite reason: the viewer's own button
 * should not wait on the indexer. `web.write.entity_response` measures p50 9.9s / p95 48.6s, and
 * `pending.expectedResponse` is known locally the instant the write starts — so the UI can show
 * the position immediately and let the real row replace it when it lands.
 *
 * `expectedResponse === null` is a *removal*, and callers must honour it: clicking a position off
 * should disappear as fast as clicking one on.
 */
export function pendingClaimResponse(queryKey: readonly unknown[], data: unknown) {
  const [scope, personalSpaceId, entityId, spaceId, responseKind] = queryKey;
  const indexingState = data as EntityResponseIndexingState | undefined;
  if (
    scope !== 'entity-response-indexing' ||
    !indexingState?.pending ||
    (responseKind !== 'stance' && responseKind !== 'veracity')
  ) {
    return null;
  }
  return {
    entityId: String(entityId),
    position:
      indexingState.pending.expectedResponse === null ? null : indexingState.pending.expectedResponse === 'positive',
    responseKind: responseKind as DebateResponseKind,
    spaceId: String(spaceId),
    /** Whose write this is, so a reader can attribute the row without assuming the current viewer. */
    personalSpaceId: String(personalSpaceId),
    /** Used to distinguish confirmed responses from rolled-back responses. */
    status: indexingState.status,
    /** One per submission, so each submission is reported once. */
    runId: indexingState.runId,
  };
}

export function useClaimResponseIndexedNotifier(
  enabled: boolean,
  getPrivyIdentityToken: GetPrivyIdentityToken,
  accountKey: string | null
) {
  const queryClient = useQueryClient();
  const { personalSpaceId } = usePersonalSpaceId();
  // Lanes outlive the effect, so a re-enabled notifier queues behind a report still in flight
  // instead of racing it.
  const lanes = React.useRef(new Map<string, ReportLane>());
  const activeAccountKey = React.useRef<string | null>(null);
  // The account and personal space the notifier last reported for.
  const confirmedIdentity = React.useRef<{ accountKey: string; personalSpaceId: string } | null>(null);
  // When the notifier last stopped listening. Indexing states updated after that were missed.
  const inactiveSince = React.useRef(0);

  React.useEffect(() => {
    const laneMap = lanes.current;
    return () => {
      for (const lane of laneMap.values()) cancelLane(lane);
      laneMap.clear();
    };
  }, []);

  // Another account's reports never go out: cancel them the moment the account changes or signs out,
  // without waiting for the new account's personal space to load.
  React.useEffect(() => {
    for (const [laneKey, lane] of lanes.current) {
      if (lane.accountKey === accountKey) continue;
      cancelLane(lane);
      lanes.current.delete(laneKey);
    }
  }, [accountKey]);

  React.useEffect(() => {
    if (!enabled || !accountKey || !personalSpaceId) return;
    // Just after a switch the personal-space query can still hold the previous account's space.
    const previous = confirmedIdentity.current;
    if (previous && previous.accountKey !== accountKey && sameSpaceId(previous.personalSpaceId, personalSpaceId)) {
      return;
    }
    confirmedIdentity.current = { accountKey, personalSpaceId };
    activeAccountKey.current = accountKey;
    const viewerSpaceId = personalSpaceId;

    // The only refresh guaranteed to postdate the notification, so every surface reading geo-chat's
    // copy of the position — the rematch picker (GEO-2603) and the readiness sources (GEO-2814) —
    // is asked again here, whether or not the notification succeeded.
    const refreshReadiness = (sent: ClaimReport) => {
      void refreshRematchClaimBatches(
        queryClient,
        rematchClaimBatchesWithClaim(sent.accountKey, sent.response.entityId)
      );
      for (const queryKey of readinessQueryPrefixes(sent.accountKey, sent.response.spaceId)) {
        void queryClient.invalidateQueries({ queryKey });
      }
    };

    const drain = (lane: ReportLane) => {
      const next = lane.waiting;
      if (lane.inFlight || lane.retryTimer || !next || next.accountKey !== activeAccountKey.current) return;
      lane.waiting = null;
      send(lane, next);
    };

    const send = (lane: ReportLane, report: ClaimReport) => {
      const controller = new AbortController();
      lane.inFlight = controller;
      const { response } = report;
      void notifyClaimResponseIndexed(
        response.spaceId,
        response.entityId,
        response.responseKind,
        response.position,
        report.getPrivyIdentityToken,
        report.accountKey,
        controller.signal
      )
        .then(() => {
          lane.rateLimitedRetries = 0;
          lane.retrying = null;
        })
        .catch(error => {
          if (isAbortError(error)) return;
          if (error instanceof GeoChatRequestError && error.status === 429) {
            if (lane.retrying !== report.notificationKey) {
              lane.retrying = report.notificationKey;
              lane.rateLimitedRetries = 0;
            }
            if (lane.rateLimitedRetries < MAX_RATE_LIMITED_RETRIES) {
              lane.rateLimitedRetries += 1;
              // A newer report waiting behind this one already carries the newer answer.
              lane.waiting ??= report;
              lane.retryTimer = setTimeout(() => {
                lane.retryTimer = null;
                drain(lane);
              }, error.retryAfterMs ?? RATE_LIMITED_RETRY_MS);
              return;
            }
          }
          lane.rateLimitedRetries = 0;
          lane.retrying = null;
          // Not delivered, so the same report may be sent again.
          if (lane.lastKey === report.notificationKey) lane.lastKey = null;
        })
        .finally(() => {
          if (lane.inFlight === controller) lane.inFlight = null;
          if (controller.signal.aborted) return;
          refreshReadiness(report);
          drain(lane);
        });
    };

    const report = (next: ClaimReport) => {
      let lane = lanes.current.get(next.laneKey);
      if (!lane) {
        lane = {
          accountKey: next.accountKey,
          inFlight: null,
          waiting: null,
          retryTimer: null,
          rateLimitedRetries: 0,
          lastKey: null,
          retrying: null,
        };
        lanes.current.set(next.laneKey, lane);
      }
      // Any other report is sent, including an earlier run restored after a newer one failed:
      // geo-chat was last told the newer run's side.
      if (lane.lastKey === next.notificationKey) return;
      lane.lastKey = next.notificationKey;
      if (lane.inFlight || lane.retryTimer) {
        lane.waiting = next;
        return;
      }
      send(lane, next);
    };

    // This account's own lanes resume where they left off.
    for (const lane of lanes.current.values()) {
      if (lane.accountKey === accountKey) drain(lane);
    }

    const handle = (query: Query) => {
      const [scope, , entityId, spaceId, responseKind] = query.queryKey;
      if (scope !== 'entity-response-indexing') return;
      // Attributed by the write's own identity: the key's space slot is null for a write that started
      // before the personal space loaded, and another account's write can still settle after a switch.
      const writerSpaceId = (query.state.data as EntityResponseIndexingState | undefined)?.pending?.personalSpaceId;
      if (!writerSpaceId || !sameSpaceId(writerSpaceId, viewerSpaceId)) return;
      const laneKey = `${accountKey}|${entityId}|${spaceId}|${responseKind}`;
      const identity = { accountKey, getPrivyIdentityToken };

      // Still sent once the chain confirms: if the in-flight report named a position the write never
      // landed, this one carries the truth and geo-chat converges on it.
      const indexed = claimResponseIndexedEvent(query.queryKey, query.state.data);
      if (indexed) {
        report({ laneKey, notificationKey: `${laneKey}:${indexed.runId}`, response: indexed, ...identity });
        return;
      }

      // GEO-2784: tell geo-chat the moment the write starts rather than when it indexes, so the
      // opposite side's Request debate appears at once. Keyed apart from the indexed report so both
      // are sent.
      const pending = pendingClaimResponse(query.queryKey, query.state.data);
      if (!pending) return;
      report({ laneKey, notificationKey: `${laneKey}:pending:${pending.runId}`, response: pending, ...identity });
    };

    // States that changed while nothing was listening, oldest first.
    const missed = queryClient
      .getQueryCache()
      .findAll({ queryKey: ['entity-response-indexing'] })
      .filter(query => query.state.dataUpdatedAt > inactiveSince.current)
      .sort((left, right) => left.state.dataUpdatedAt - right.state.dataUpdatedAt);
    for (const query of missed) handle(query);

    const unsubscribe = queryClient.getQueryCache().subscribe(event => {
      if (event.type === 'updated' && event.action.type === 'success') handle(event.query);
    });

    return () => {
      unsubscribe();
      activeAccountKey.current = null;
      inactiveSince.current = Date.now();
      // A report already sent keeps running, and a Retry-After wait keeps its timer. Either drains
      // once this account is active again.
    };
  }, [accountKey, enabled, getPrivyIdentityToken, personalSpaceId, queryClient]);
}

function cancelLane(lane: ReportLane) {
  lane.inFlight?.abort();
  lane.inFlight = null;
  if (lane.retryTimer) clearTimeout(lane.retryTimer);
  lane.retryTimer = null;
  lane.waiting = null;
}

function sameSpaceId(left: string, right: string) {
  return left.replace(/-/g, '').toLowerCase() === right.replace(/-/g, '').toLowerCase();
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError';
}
