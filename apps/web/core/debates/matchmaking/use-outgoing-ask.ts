'use client';

import * as React from 'react';

import { atom, useAtom } from 'jotai';

import { useLiveOutboundChallenge, useLiveOutboundRequest } from '~/core/claims/browse/use-claim-matchup';
import { normId } from '~/core/utils/norm-id';

import { hasActiveDebateFlow } from '../activity-state';
import type { DebateClaimSummary } from '../api';
import { useDebateActivity, useGeoChatAuth, useRejectDebateChallenge } from '../hooks';
import { speakerLabel } from '../playback-utils';
import { askWasWithdrawn } from './ask-withdrawals';
import { useDebateRequests, useWithdrawDebateRequest } from './hooks';
import { useRequestCountdown } from './use-request-countdown';

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

/** Why a Debate now waits while the viewer's one ask is out, wherever the panel pauses one. */
export const ONE_ASK_AT_A_TIME_REASON = 'One request at a time. Cancel yours to ask on another claim.';

/** The same, for a claim's Debate now: "another claim" only reads right when the ask is one. */
export function claimPausedReason(ask: OutgoingAsk) {
  return ask.kind === 'person'
    ? 'One request at a time. Cancel your challenge to ask on a claim.'
    : ONE_ASK_AT_A_TIME_REASON;
}

/**
 * An ask that ran out without anyone taking it. Kept until the viewer dismisses it or asks again, so
 * the strip can say so and offer Schedule rather than the ask silently vanishing (GEO-3463).
 */
export type EndedAsk = OutgoingAsk;

/** How long "nobody took it" stays up untouched. Past this it is old news rather than a prompt. */
export const ENDED_ASK_TTL_MS = 5 * 60_000;

/**
 * The ended ask, with whose it was and when it ended. In an atom rather than state because the strip
 * lives in the panel header, which outlives every tab. Stamped with the account, so a sign-out or a
 * switch on this device never shows one person's ended ask to another.
 */
const endedAskAtom = atom<{ ask: EndedAsk; accountKey: string; endedAt: number } | null>(null);

/**
 * `m:ss` for a live ask, the format the design uses wherever one is timed ("Requesting · 1:12"). The
 * countdown itself is the request cards' (`useRequestCountdown`), asked for in its clock format.
 */
export function useAskClock(expiresAt: string | null) {
  const { remainingMs, label } = useRequestCountdown(expiresAt, { format: 'clock' });
  return { remainingMs, label };
}

/**
 * The viewer's open ask, the one that just ended unanswered, and how to cancel or dismiss them.
 *
 * Reads the same two sources every other surface does — the requests list, falling back to the
 * activity payload — so the strip, the pressed button and the paused ones cannot disagree.
 *
 * Call it once per surface: `HubAskProvider` does, and everything else reads its context. Each call
 * keeps its own memory of the previous ask, so two of them would each decide for themselves whether
 * the ask that just went had ended.
 */
export function useOutgoingAsk() {
  const { authenticated, accountKey } = useGeoChatAuth();
  const { data: activity } = useDebateActivity(authenticated);
  const { data: requests } = useDebateRequests(authenticated);
  const withdrawRequest = useWithdrawDebateRequest();
  const rejectChallenge = useRejectDebateChallenge();
  const [ended, setEnded] = useAtom(endedAskAtom);

  const outbound = useLiveOutboundRequest(activity, requests);
  const outboundChallenge = useLiveOutboundChallenge(activity);

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
  //
  // Not while signed out (the ask went because the viewer did), and not for one the viewer took back
  // from anywhere (`markAskWithdrawn`).
  //
  // Remembered per account: switching accounts without a sign-out would otherwise stamp the last
  // account's ask, gone from the new account's reads, as the new account's ended one.
  const previousRef = React.useRef<{ ask: OutgoingAsk | null; accountKey: string | null }>({
    ask: null,
    accountKey: null,
  });
  const tiedUp = hasActiveDebateFlow(activity);
  React.useEffect(() => {
    const previous = previousRef.current.accountKey === accountKey ? previousRef.current.ask : null;
    previousRef.current = { ask, accountKey };
    if (ask) {
      setEnded(null);
      return;
    }
    if (!previous) return;
    if (!authenticated || !accountKey || tiedUp || askWasWithdrawn(previous.id)) return;
    setEnded({ ask: previous, accountKey, endedAt: Date.now() });
  }, [accountKey, ask, authenticated, setEnded, tiedUp]);

  // Someone took it after all: the requests list can let go of an accepted request a beat before the
  // activity payload reports the debate, which reads as an ask that ran out. Once the debate shows
  // up, that was wrong.
  React.useEffect(() => {
    if (tiedUp) setEnded(null);
  }, [setEnded, tiedUp]);

  // Old news after a few minutes, whether or not anyone looked.
  const endedAt = ended?.endedAt ?? null;
  React.useEffect(() => {
    if (endedAt === null) return;
    const timeout = setTimeout(() => setEnded(null), Math.max(0, endedAt + ENDED_ASK_TTL_MS - Date.now()));
    return () => clearTimeout(timeout);
  }, [endedAt, setEnded]);

  const cancel = React.useCallback(() => {
    if (!ask) return;
    if (ask.kind === 'claim') withdrawRequest.mutate(ask.id);
    else rejectChallenge.mutate(ask.id);
  }, [ask, rejectChallenge, withdrawRequest]);

  const dismissEnded = React.useCallback(() => setEnded(null), [setEnded]);

  const endedForViewer = !ask && authenticated && ended !== null && ended.accountKey === accountKey ? ended.ask : null;

  return {
    ask,
    ended: endedForViewer,
    cancel,
    cancelling: withdrawRequest.isPending || rejectChallenge.isPending,
    dismissEnded,
  };
}

export type OutgoingAskState = ReturnType<typeof useOutgoingAsk>;

/** Whether this ask is the one a claim card's button sent. Ids compare dashless either way. */
export function askIsForClaim(
  ask: OutgoingAsk | null,
  claim: string | Pick<DebateClaimSummary, 'space_id' | 'claim_entity_id'>
) {
  if (ask?.kind !== 'claim') return false;
  // Given the card's claim, the space has to match too: the same claim tagged in two spaces is two
  // cards, and only the one in the request's space sent it.
  if (typeof claim !== 'string' && normId(ask.claim.space_id) !== normId(claim.space_id)) return false;
  const claimEntityId = typeof claim === 'string' ? claim : claim.claim_entity_id;
  return normId(ask.claim.claim_entity_id) === normId(claimEntityId);
}

/** Whether this ask is the one a People row's button sent. */
export function askIsForPerson(ask: OutgoingAsk | null, profileSpaceId: string) {
  return ask?.kind === 'person' && ask.recipientProfileSpaceId === normId(profileSpaceId);
}
