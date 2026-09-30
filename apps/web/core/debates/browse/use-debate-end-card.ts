'use client';

import { skipToken, useQueries } from '@tanstack/react-query';

import * as React from 'react';

import { CLAIM_RESPONSE_OBJECT_TYPE } from '~/core/claims/browse/claim-response-summary';
import { resolveClaimResponseKind } from '~/core/claims/browse/use-claim-response-state';
import type { Debate, DebateParticipant } from '~/core/debates/api';
import { type ResponseSplit, type ResponseTally, distinctResponders, poolResponses } from '~/core/debates/end-card';
import { orderedParticipants, speakerLabel } from '~/core/debates/playback-utils';
import { claimsForParticipant } from '~/core/debates/transcript-claims';
import { useDebateTranscriptClaims } from '~/core/debates/use-debate-transcript-claims';
import type { EntityResponder } from '~/core/io/queries';
import { entityRespondersQueryKey, entityResponseCountsQueryKey } from '~/core/responses/entity-response';
import { useClaimResponseSummaryBatch } from '~/core/responses/use-claim-response-summaries';
import { useQueryEntities } from '~/core/sync/use-store';
import { normId } from '~/core/utils/norm-id';

import { useDebateClaimResponse } from './use-debate-claim-response';
import { useNextDebate } from './use-next-debate';

export type EndCardDebater = {
  participant: DebateParticipant;
  name: string;
  /** Every claim they made, wherever it was published. Null until the transcript has answered. */
  claimCount: number | null;
  /** Responses to the claims that live in the debate's space, pooled. */
  split: ResponseSplit;
  /** Everyone who answered any of those claims, once each. */
  responderSpaceIds: string[];
};

/**
 * Everything the end card draws, in one place.
 *
 * One batched read covers the claim being debated and every claim either debater made, and it seeds
 * the per-claim caches as it lands — so the claim's own vote control, its voter list and the claims
 * panel all read what this fetched instead of asking again.
 *
 * The debaters' numbers are read back out of those per-claim caches rather than off the batch's own
 * result. A vote refreshes the caches of the claim it was cast on and leaves the batch alone, so a
 * card reading the batch kept the old split for every claim voted on in the panel since it loaded.
 *
 * `enabled` is the caller's: the player turns it on while the debate is the active one, so the card
 * has its numbers by the time the video ends rather than drawing empty bars and filling them in.
 *
 * `shown` is whether the card is on screen. Those numbers were read when the debate became active,
 * minutes before it ended, and a query does not refetch just because it went stale — so when the
 * card appears, anything older than the batch's `staleTime` is asked for again, with the old numbers
 * drawn until the new ones land.
 */
export function useDebateEndCard(debate: Debate, enabled: boolean, shown = false) {
  /*
   * One way: once this debate has asked, it keeps asking for as long as the player is mounted.
   *
   * `enabled` follows whether the debate is the active one, and scrolling makes another one active
   * while this card is still on screen. Turning the reads off then did more than stop fetching:
   * `useQueryEntities` answers a disabled query with no entities at all, cached or not, so the
   * claim's response state lost its entity, reported no counts, and the card's numbers vanished and
   * came back as the viewer scrolled. The flag is only there to keep debates nobody has reached from
   * fetching; one that has been reached has nothing left to save. Keyed on the debate, so a player
   * handed a different one starts held back again.
   */
  const [askedFor, setAskedFor] = React.useState<string | null>(enabled ? debate.id : null);
  if (enabled && askedFor !== debate.id) setAskedFor(debate.id);
  const live = enabled || askedFor === debate.id;

  const responseKind = resolveClaimResponseKind();
  // One spelling of the space and the claim for every read below, so the batch's cache seeding and
  // the per-claim hooks land on the same keys. geo-chat and the graph format ids differently.
  const spaceId = normId(debate.claim.space_id);
  const claimId = normId(debate.claim.claim_entity_id);

  const participants = React.useMemo(() => orderedParticipants(debate), [debate]);
  const transcript = useDebateTranscriptClaims(debate.id, debate.claim.space_id, live);
  const { claims } = transcript;
  // Whether `claims` is the debate's, rather than the empty set standing in while it loads or after
  // it failed. Nothing below may report a count off the stand-in.
  const claimsReady = live && !transcript.isLoading && transcript.error === null;

  // Responses are per space, so only the claims published in the debate's own space can be
  // counted against it. A claim the debate quoted from elsewhere has its votes somewhere else, and
  // asking this space about it would report zero rather than the truth.
  const claimsByParticipant = React.useMemo(
    () =>
      participants.map(participant => {
        const made = claimsForParticipant(claims, participant.profile_space_id);
        return {
          participant,
          claimCount: made.length,
          countedIds: made
            .filter(claim => claim.spaceId !== null && normId(claim.spaceId) === spaceId)
            .map(claim => normId(claim.id)),
        };
      }),
    [claims, participants, spaceId]
  );

  const countedIds = React.useMemo(() => claimsByParticipant.flatMap(entry => entry.countedIds), [claimsByParticipant]);
  const targets = React.useMemo(
    () => [claimId, ...countedIds].map(entityId => ({ entityId, responseKind })),
    [claimId, countedIds, responseKind]
  );
  // Fetches and seeds. Its values are read back through the per-claim caches (see the note on the
  // hook); all that is read off the batch itself is whether it has finished.
  const batch = useClaimResponseSummaryBatch({ spaceId, targets, enabled: live && claimsReady });
  // Whether the batch is still on its way to seeding the claim's caches. A transcript still loading
  // counts, since the batch starts when it lands; a transcript that failed does not, since then the
  // batch never starts at all.
  const batchPending = transcript.isLoading || (claimsReady && batch.data === undefined && !batch.isError);

  // Only a batch that has answered is refreshed: one still waiting on the transcript, or that
  // failed, has nothing on screen to bring up to date.
  const refreshIfStale = React.useEffectEvent(() => {
    if (batch.data !== undefined && batch.isStale && !batch.isFetching) void batch.refetch();
  });
  React.useEffect(() => {
    if (shown) refreshIfStale();
  }, [shown]);

  // Each counted claim's counts and responders, straight from the caches the batch seeds and a vote
  // refreshes. `skipToken` because these only ever read: the batch is what asks.
  const countsById = useCachedByClaim<{ positive: number; negative: number } | null>(countedIds, entityId =>
    entityResponseCountsQueryKey(entityId, spaceId, CLAIM_RESPONSE_OBJECT_TYPE, responseKind)
  );
  const respondersById = useCachedByClaim<EntityResponder[]>(countedIds, entityId =>
    entityRespondersQueryKey(entityId, spaceId, CLAIM_RESPONSE_OBJECT_TYPE, responseKind)
  );

  // The claim's own control resolves its vocabulary off the graph entity, and holds its reads back
  // until it has one — the same lookup the claims panel does for its rows.
  const { entities } = useQueryEntities({ where: { id: { in: [claimId] } }, first: 1, enabled: live });
  const claimResponse = useDebateClaimResponse({
    claimId,
    spaceId,
    row: null,
    // Held back until the batch has seeded this claim's caches. Its two reads — the counts and the
    // viewer's own side — then find them fresh (their 30s `staleTime` outlasts the wait) instead of
    // racing the batch to the same two answers on every debate that becomes active. If the batch
    // fails, or never starts because the transcript failed, the entity is handed over anyway and
    // the claim asks for itself: its own row needs nothing from the transcript.
    entity: batchPending ? null : (entities[0] ?? null),
  });

  const debaters = React.useMemo<EndCardDebater[]>(
    () =>
      // The Agree side first, whatever slot it recorded in: the card's Agree button and the green end
      // of every split bar are both on the left, so the
      // debater arguing for the claim has to be too. Stable, so slot order holds within a side.
      [...claimsByParticipant]
        .sort((left, right) => Number(right.participant.position) - Number(left.participant.position))
        .map(({ participant, claimCount, countedIds: ids }) => {
          const tallies: ResponseTally[] = ids.map(entityId => ({
            counts: countsById.get(entityId) ?? { positive: 0, negative: 0 },
            responders: respondersById.get(entityId) ?? [],
          }));
          return {
            participant,
            name: speakerLabel(participant),
            claimCount: claimsReady ? claimCount : null,
            split: poolResponses(tallies),
            responderSpaceIds: distinctResponders(tallies),
          };
        }),
    [claimsByParticipant, claimsReady, countsById, respondersById]
  );

  const nextDebate = useNextDebate(debate, live, shown);

  return {
    claimId,
    spaceId,
    claimText: debate.claim.claim,
    claimResponse,
    debaters,
    /** Where the card points the viewer next: a debate they haven't watched. Null for none. */
    nextDebate,
    /**
     * Whether the debaters' counts are an answer: the transcript has said which claims are theirs,
     * and every one of those has its counts. Until then their splits are zero because nothing has
     * been asked, and the card must not print "No votes yet" off that.
     *
     * `undefined` is "not asked yet"; `null` is an answer. The batch writes a claim nobody has voted
     * on as zeros, but the per-claim read — which the claims panel's rows run once these caches are
     * past their `staleTime` — writes the API's own answer for it, which is `null`. Counting that as
     * unanswered emptied the card whenever the panel was opened a while after the debate ended.
     */
    countsReady: claimsReady && countedIds.every(entityId => countsById.get(entityId) !== undefined),
  };
}

/**
 * One cached value per claim, subscribed to so it re-renders when a vote refreshes it.
 *
 * Read-only by construction (`skipToken`): the batch is the one fetcher, and a second request per
 * claim would undo the point of batching them.
 */
function useCachedByClaim<T>(claimIds: string[], keyFor: (claimId: string) => readonly unknown[]) {
  const values = useQueries({
    queries: claimIds.map(claimId => ({ queryKey: keyFor(claimId), queryFn: skipToken })),
    combine: dataOf,
  }) as (T | undefined)[];
  return React.useMemo(() => new Map(claimIds.map((claimId, index) => [claimId, values[index]])), [claimIds, values]);
}

/**
 * Module-level so `useQueries` sees the same `combine` every render and hands back the same array
 * until a value actually changes — which is what lets the debaters above stay memoized.
 */
function dataOf(results: { data: unknown }[]) {
  return results.map(result => result.data);
}
