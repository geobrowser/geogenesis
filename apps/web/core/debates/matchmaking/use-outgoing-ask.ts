'use client';

import * as React from 'react';

import { atom, useAtom } from 'jotai';

import { normId } from '~/core/utils/norm-id';

import { hasActiveDebateFlow } from '../activity-state';
import type { DebateClaimSummary } from '../api';
import { useDebateActivity, useGeoChatAuth, useRejectDebateChallenge } from '../hooks';
import { speakerLabel } from '../playback-utils';
import { useCurrentGeoChatUserId } from '../use-current-geo-chat-user-id';
import { useDebateRequests, useWithdrawDebateRequest } from './hooks';
import { useLiveRequest, useServerClock } from './use-request-countdown';

/**
 * The one live ask the viewer has out (GEO-3463): a claim request, which fans out to up to three
 * people who hold the other side, or a challenge to one person. geo-chat allows one of each at a
 * time and the panel treats them as one slot, so every Debate now button reads this to know whether
 * it is the one that was pressed, or one that has to wait.
 */
export type OutgoingAsk =
  | {
      kind: 'claim';
      id: string;
      claim: DebateClaimSummary;
      createdAt: string;
      expiresAt: string;
    }
  | {
      kind: 'person';
      id: string;
      /** Dashless profile space id of the person asked, the key People rows compare against. */
      recipientProfileSpaceId: string;
      recipientName: string;
      createdAt: string;
      expiresAt: string;
    };

/**
 * An ask that ran out without anyone taking it. Kept until the viewer dismisses it or asks again, so
 * the strip can say so and offer Schedule rather than the ask silently vanishing (GEO-3463). Held in
 * an atom rather than state because the strip lives in the panel header, which outlives every tab.
 */
export type EndedAsk = Extract<OutgoingAsk, { kind: 'claim' }> | Extract<OutgoingAsk, { kind: 'person' }>;

const endedAskAtom = atom<EndedAsk | null>(null);

/**
 * Asks the viewer withdrew themselves. Withdrawing is not "nobody took it", so the ended state skips
 * them. Module-level ids rather than an atom: nothing renders from this, it is only consulted when
 * an ask disappears.
 */
const withdrawnAskIds = new Set<string>();

/**
 * `m:ss`, the countdown format the design uses everywhere a live ask is timed ("Requesting · 1:12").
 * Rounded up, so the label never reads 0:00 while the ask is still open.
 */
export function formatAskClock(remainingMs: number) {
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) return '0:00';
  const totalSeconds = Math.ceil(remainingMs / 1_000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Seconds-resolution remaining time for an ask, against the server's clock. `useRequestCountdown`
 * ticks every 15 s while more than a minute is left, which is fine for "Expires in 2m" but would
 * make an m:ss clock jump in quarter-minutes.
 */
export function useAskClock(expiresAt: string | null) {
  const clock = useServerClock(expiresAt !== null);
  const expiresAtMs = expiresAt ? new Date(expiresAt).getTime() : NaN;
  const [now, setNow] = React.useState(() => Date.now());

  React.useEffect(() => {
    if (!Number.isFinite(expiresAtMs)) return;
    const read = () => (clock ? clock.now() : Date.now());
    setNow(read());
    const interval = setInterval(() => setNow(read()), 1_000);
    return () => clearInterval(interval);
  }, [clock, expiresAtMs]);

  const remainingMs = Number.isFinite(expiresAtMs) ? Math.max(0, expiresAtMs - now) : 0;
  return { remainingMs, label: formatAskClock(remainingMs) };
}

/**
 * The viewer's open ask, the one that just ended unanswered, and how to cancel or dismiss them.
 *
 * Reads the same two sources every other surface does — the requests list, falling back to the
 * activity payload — so the strip, the pressed button and the paused ones cannot disagree.
 */
export function useOutgoingAsk() {
  const { authenticated } = useGeoChatAuth();
  const { data: activity } = useDebateActivity(authenticated);
  const { data: requests } = useDebateRequests(authenticated);
  const currentUserId = useCurrentGeoChatUserId();
  const withdrawRequest = useWithdrawDebateRequest();
  const rejectChallenge = useRejectDebateChallenge();
  const [ended, setEnded] = useAtom(endedAskAtom);

  const outbound = useLiveRequest(requests?.outbound ?? activity?.outbound_request);
  const challenge = useLiveRequest(activity?.challenge);
  const outboundChallenge =
    challenge && currentUserId && challenge.requester.user_id === currentUserId ? challenge : null;

  const ask = React.useMemo<OutgoingAsk | null>(() => {
    if (!authenticated) return null;
    if (outbound) {
      return {
        kind: 'claim',
        id: outbound.id,
        claim: outbound.claim,
        createdAt: outbound.created_at,
        expiresAt: outbound.expires_at,
      };
    }
    if (outboundChallenge) {
      return {
        kind: 'person',
        id: outboundChallenge.id,
        recipientProfileSpaceId: normId(outboundChallenge.recipient.profile_space_id),
        recipientName: speakerLabel(outboundChallenge.recipient),
        createdAt: outboundChallenge.created_at,
        expiresAt: outboundChallenge.expires_at,
      };
    }
    return null;
  }, [authenticated, outbound, outboundChallenge]);

  // An ask that disappears without a debate or a rematch session behind it ran out unanswered:
  // expired, or passed on by everyone offered it. Telling those two apart needs geo-chat (GEO-3464),
  // so the strip says the one thing both share.
  const previousRef = React.useRef<OutgoingAsk | null>(null);
  const tiedUp = hasActiveDebateFlow(activity);
  React.useEffect(() => {
    const previous = previousRef.current;
    previousRef.current = ask;
    if (ask) {
      setEnded(null);
      return;
    }
    if (!previous) return;
    // Consulted once, then forgotten, so the set only ever holds asks still on their way out.
    const withdrawn = withdrawnAskIds.delete(previous.id);
    if (tiedUp || withdrawn) return;
    setEnded(previous);
  }, [ask, setEnded, tiedUp]);

  const cancel = React.useCallback(() => {
    if (!ask) return;
    withdrawnAskIds.add(ask.id);
    if (ask.kind === 'claim') withdrawRequest.mutate(ask.id);
    else rejectChallenge.mutate(ask.id);
  }, [ask, rejectChallenge, withdrawRequest]);

  const dismissEnded = React.useCallback(() => setEnded(null), [setEnded]);

  return {
    ask,
    ended: ask ? null : ended,
    cancel,
    cancelling: withdrawRequest.isPending || rejectChallenge.isPending,
    dismissEnded,
  };
}

/** Whether this ask is the one a claim card's button sent. Ids compare dashless either way. */
export function askIsForClaim(ask: OutgoingAsk | null, claimEntityId: string) {
  return ask?.kind === 'claim' && normId(ask.claim.claim_entity_id) === normId(claimEntityId);
}

/** Whether this ask is the one a People row's button sent. */
export function askIsForPerson(ask: OutgoingAsk | null, profileSpaceId: string) {
  return ask?.kind === 'person' && ask.recipientProfileSpaceId === normId(profileSpaceId);
}
