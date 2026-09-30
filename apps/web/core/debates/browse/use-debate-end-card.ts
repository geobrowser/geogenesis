'use client';

import * as React from 'react';

import { resolveClaimResponseKind } from '~/core/claims/browse/use-claim-response-state';
import type { Debate, DebateParticipant } from '~/core/debates/api';
import { drawableClaims, speakersByClaimId } from '~/core/debates/claim-ticker';
import { type TimedClaim, claimsInSpokenOrder } from '~/core/debates/claim-timing';
import { useClaimTimings } from '~/core/debates/use-claim-timings';
import { useDebateTranscriptClaims } from '~/core/debates/use-debate-transcript-claims';
import { useClaimResponseSummaryBatch } from '~/core/responses/use-claim-response-summaries';
import { useQueryEntities } from '~/core/sync/use-store';
import type { Entity } from '~/core/types';
import { normId } from '~/core/utils/norm-id';

import { useDebateClaimResponse } from './use-debate-claim-response';
import { useNextDebate } from './use-next-debate';

const NO_ENTITIES: ReadonlyMap<string, Entity> = new Map();

/** The claims the debate extracted, as the end card's carousel draws them. */
export type EndCardClaims = {
  /** In the order they were said. Empty until the transcript and its timings have both answered. */
  claims: TimedClaim[];
  speakerByClaimId: ReadonlyMap<string, DebateParticipant>;
  entitiesByClaimId: ReadonlyMap<string, Entity>;
};

/**
 * Everything the end card draws, in one place.
 *
 * One batched read covers the claim being debated and every claim the debate extracted, and it
 * seeds the per-claim caches as it lands — so the claim's own vote control and every card in the
 * carousel read what this fetched instead of each asking again.
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

  // The same reads the live claim cards make, on the same keys, so a debate that played with its
  // cards up hands the carousel a warm cache. Made here rather than borrowed from the player's
  // ticker, which switches off when the viewer scrolls to another debate — while this card, and the
  // carousel on it, can still be on screen.
  const transcript = useDebateTranscriptClaims(debate.id, debate.claim.space_id, live);
  const { claims } = transcript;
  // Whether `claims` is the debate's, rather than the empty set standing in while it loads or after
  // it failed.
  const claimsReady = live && !transcript.isLoading && transcript.error === null;
  const { timings, isReady: timingsReady } = useClaimTimings(debate.id, claims, live);

  const speakerByClaimId = React.useMemo(() => speakersByClaimId(debate, claims), [claims, debate]);
  // Held until the timings are in, so the carousel isn't drawn in graph order — which is random —
  // and then reshuffled under a viewer who has started scrolling it.
  const carouselClaims = React.useMemo(
    () =>
      claimsReady && timingsReady ? drawableClaims(claimsInSpokenOrder(claims.all, timings), speakerByClaimId) : [],
    [claims.all, claimsReady, speakerByClaimId, timings, timingsReady]
  );

  // Every claim's entity in one lookup — the same one the live cards make, so it is usually a cache
  // read. Each card's vote control holds its reads back until it has its entity.
  const allClaimIds = React.useMemo(() => claims.all.map(claim => claim.id), [claims.all]);
  const { entities: claimEntities } = useQueryEntities({
    where: { id: { in: allClaimIds } },
    first: allClaimIds.length || 1,
    enabled: live && allClaimIds.length > 0,
  });
  const entitiesByClaimId = React.useMemo(
    () => new Map(claimEntities.map(entity => [entity.id, entity])),
    [claimEntities]
  );

  // Responses are per space, so only the claims published in the debate's own space can be batched
  // against it. A claim quoted from elsewhere asks its own space for itself.
  const targets = React.useMemo(
    () =>
      [
        claimId,
        ...claims.all
          .filter(claim => claim.spaceId !== null && normId(claim.spaceId) === spaceId)
          .map(claim => normId(claim.id)),
      ].map(entityId => ({ entityId, responseKind })),
    [claimId, claims.all, responseKind, spaceId]
  );
  // Fetches and seeds; all that is read off the batch itself is whether it has finished.
  const batch = useClaimResponseSummaryBatch({ spaceId, targets, enabled: live && claimsReady });
  // Whether the batch is still on its way to seeding the claim's caches. A transcript still loading
  // counts, since the batch starts when it lands; a transcript that failed does not, since then the
  // batch never starts at all.
  const batchPending = transcript.isLoading || (claimsReady && batch.data === undefined && !batch.isError);

  const refreshIfStale = React.useEffectEvent(() => {
    if (batch.data !== undefined && batch.isStale && !batch.isFetching) void batch.refetch();
  });
  React.useEffect(() => {
    if (shown) refreshIfStale();
  }, [shown]);

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

  const nextDebate = useNextDebate(debate, live, shown);

  const carousel = React.useMemo<EndCardClaims>(
    () => ({
      claims: carouselClaims,
      speakerByClaimId,
      // Held back while the batch is seeding, for the same reason as the claim's own entity above:
      // each card's control would otherwise race the batch to answers it is already fetching.
      entitiesByClaimId: batchPending ? NO_ENTITIES : entitiesByClaimId,
    }),
    [batchPending, carouselClaims, entitiesByClaimId, speakerByClaimId]
  );

  return {
    claimId,
    spaceId,
    claimText: debate.claim.claim,
    claimResponse,
    carousel,
    /** Where the card points the viewer next: a debate they haven't watched. Null for none. */
    nextDebate,
  };
}
