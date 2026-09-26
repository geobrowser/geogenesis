'use client';

import * as React from 'react';

import { resolveClaimResponseKind } from '~/core/claims/browse/use-claim-response-state';
import type { Debate, DebateParticipant } from '~/core/debates/api';
import {
  type ResponseSplit,
  type ResponseTally,
  claimVsArguments,
  distinctResponders,
  poolResponses,
} from '~/core/debates/end-card';
import { orderedParticipants, speakerLabel } from '~/core/debates/playback-utils';
import { claimsForParticipant } from '~/core/debates/transcript-claims';
import { useDebateTranscriptClaims } from '~/core/debates/use-debate-transcript-claims';
import { claimResponseTargetKey } from '~/core/responses/claim-response-summaries';
import { useClaimResponseSummaryBatch } from '~/core/responses/use-claim-response-summaries';
import { useQueryEntities } from '~/core/sync/use-store';
import { normId } from '~/core/utils/norm-id';

import { useDebateClaimResponse } from './use-debate-claim-response';

export type EndCardDebater = {
  participant: DebateParticipant;
  name: string;
  /** Every claim they made, wherever it was published — the count the card prints. */
  claimCount: number;
  /** Responses to the claims that live in the debate's space, pooled. */
  split: ResponseSplit;
  /** Everyone who answered any of those claims, once each. */
  responderSpaceIds: string[];
};

const EMPTY_TALLY: ResponseTally = { counts: { positive: 0, negative: 0 }, responders: [] };

/**
 * Everything the end card draws, in one place.
 *
 * One batched read covers the claim being debated and every claim either debater made, and it seeds
 * the per-claim caches as it lands — so the claim's own vote control, its voter list and the claims
 * panel all read what this fetched instead of asking again.
 *
 * `enabled` is the caller's: the player turns it on while the debate is the active one, so the card
 * has its numbers by the time the video ends rather than drawing empty bars and filling them in.
 */
export function useDebateEndCard(debate: Debate, enabled: boolean) {
  /*
   * One way: once this debate has asked, it keeps asking for as long as the player is mounted.
   *
   * `enabled` follows whether the debate is the active one, and scrolling makes another one active
   * while this card is still on screen. Turning the reads off then did more than stop fetching:
   * `useQueryEntities` answers a disabled query with no entities at all, cached or not, so the
   * claim's response state lost its entity, reported no counts, and the comparison box vanished and
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
  const { claims } = useDebateTranscriptClaims(debate.id, debate.claim.space_id, live);

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

  const targets = React.useMemo(
    () =>
      [claimId, ...claimsByParticipant.flatMap(entry => entry.countedIds)].map(entityId => ({
        entityId,
        responseKind,
      })),
    [claimId, claimsByParticipant, responseKind]
  );
  const batch = useClaimResponseSummaryBatch({ spaceId, targets, enabled: live });

  // The claim's own control resolves its vocabulary off the graph entity, and holds its reads back
  // until it has one — the same lookup the claims panel does for its rows.
  const { entities } = useQueryEntities({ where: { id: { in: [claimId] } }, first: 1, enabled: live });
  const claimResponse = useDebateClaimResponse({
    claimId,
    spaceId,
    row: null,
    entity: entities[0] ?? null,
  });

  const debaters = React.useMemo<EndCardDebater[]>(
    () =>
      // The Agree side first, whatever slot it recorded in: the card's Agree button, the green end
      // of every split bar and the Agree end of the comparison line are all on the left, so the
      // debater arguing for the claim has to be too. Stable, so slot order holds within a side.
      [...claimsByParticipant]
        .sort((left, right) => Number(right.participant.position) - Number(left.participant.position))
        .map(({ participant, claimCount, countedIds }) => {
          const tallies = countedIds.map(
            entityId => batch.data?.get(claimResponseTargetKey({ entityId, responseKind })) ?? EMPTY_TALLY
          );
          return {
            participant,
            name: speakerLabel(participant),
            claimCount,
            split: poolResponses(tallies),
            responderSpaceIds: distinctResponders(tallies),
          };
        }),
    [batch.data, claimsByParticipant, responseKind]
  );

  const agreeSide = debaters.find(debater => debater.participant.position === true) ?? null;
  const disagreeSide = debaters.find(debater => debater.participant.position === false) ?? null;
  const comparison =
    agreeSide && disagreeSide
      ? claimVsArguments({ claim: claimResponse.summary, agreeSide: agreeSide.split, disagreeSide: disagreeSide.split })
      : null;

  return {
    claimId,
    spaceId,
    claimText: debate.claim.claim,
    claimResponse,
    debaters,
    agreeSide,
    disagreeSide,
    comparison,
    /**
     * Whether the debaters' counts are an answer. Until the batch lands their splits are zero
     * because nothing has been asked, and the card must not print "No votes yet" off that.
     */
    countsReady: batch.data !== undefined,
    totalClaims: claims.totalCount,
  };
}
