'use client';

import type { TypedDocumentNode } from '@graphql-typed-document-node/core';
import { useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { Effect } from 'effect';
import { parse } from 'graphql';

import { TOPICS_PROPERTY_ID } from '~/core/claims/ontology';
import type { Debate, DebateParticipant } from '~/core/debates/api';
import { useDebate } from '~/core/debates/hooks';
import { type NextDebateCandidate, pickNextDebate } from '~/core/debates/next-debate';
import {
  DEBATE_CLAIMS_PROPERTY_ID,
  DEBATE_TYPE_ID,
  DEBATE_VIDEOS_PROPERTY_ID,
  KEY_FRAME_IMAGE_PROPERTY_ID,
} from '~/core/debates/ontology';
import { orderedParticipants } from '~/core/debates/playback-utils';
import { markDebateWatched, readWatchedDebateIds } from '~/core/debates/watched-debates';
import { ID } from '~/core/id';
import { graphql } from '~/core/io/graphql-client';
import { isDirectMediaUrl } from '~/core/utils/media-url';
import { normId } from '~/core/utils/norm-id';

import { useDebatesBestOrder } from './use-debates-best-order';

/**
 * Every published debate in a space, with what the picker and the card need: the claim it argued,
 * that claim's topics in this space, and its video's key frame.
 *
 * One request answers both of the picker's tiers — related debates and the rest of the space — and
 * the card's thumbnail. The busiest space on testnet holds a few dozen debates; `first` is set
 * explicitly because a list without it silently stops at a hundred.
 *
 * Every relation is read in this space. Topics are assigned per space, and a topic this claim only
 * carries elsewhere would make "related" mean something the claim page's gallery doesn't.
 */
const NEXT_DEBATE_CANDIDATES_SOURCE = /* GraphQL */ `
  query NextDebateCandidates(
    $spaceId: UUID!
    $debateTypeId: UUID!
    $claimsPropertyId: UUID!
    $topicsPropertyId: UUID!
    $videosPropertyId: UUID!
    $keyFramePropertyId: UUID!
  ) {
    entitiesConnection(first: 200, typeId: $debateTypeId, spaceId: $spaceId) {
      nodes {
        id
        claims: relationsList(filter: { typeId: { is: $claimsPropertyId }, spaceId: { is: $spaceId } }) {
          toEntity {
            id
            name
            topics: relationsList(filter: { typeId: { is: $topicsPropertyId }, spaceId: { is: $spaceId } }) {
              toEntityId
            }
          }
        }
        videos: relationsList(filter: { typeId: { is: $videosPropertyId }, spaceId: { is: $spaceId } }) {
          toEntity {
            keyFrames: relationsList(filter: { typeId: { is: $keyFramePropertyId } }) {
              toEntity {
                valuesList {
                  text
                }
              }
            }
          }
        }
      }
    }
  }
`;

const nextDebateCandidatesDocument = parse(NEXT_DEBATE_CANDIDATES_SOURCE) as TypedDocumentNode<any, any>;

type CandidatesResponse = {
  entitiesConnection?: {
    nodes?: Array<{
      id?: string | null;
      claims?: Array<{
        toEntity?: { id?: string | null; name?: string | null; topics?: Array<{ toEntityId?: string | null }> } | null;
      }> | null;
      videos?: Array<{
        toEntity?: { keyFrames?: Array<{ toEntity?: { valuesList?: Array<{ text?: string | null }> } | null }> } | null;
      }> | null;
    } | null> | null;
  } | null;
};

export function decodeNextDebateCandidates(data: CandidatesResponse): NextDebateCandidate[] {
  return (data.entitiesConnection?.nodes ?? []).flatMap(node => {
    // A Debate carries exactly one `Claims` relation — the motion it argued. One without a named
    // claim can't be titled, so it can't be offered.
    const claim = node?.claims?.[0]?.toEntity;
    if (!node?.id || !claim?.id || !claim.name) return [];

    const keyFrame =
      (node.videos ?? [])
        .flatMap(video => video.toEntity?.keyFrames ?? [])
        .flatMap(frame => frame.toEntity?.valuesList ?? [])
        .map(value => value.text)
        .find(isDirectMediaUrl) ?? null;

    return [
      {
        debateId: normId(node.id),
        claimId: normId(claim.id),
        claimName: claim.name,
        topicIds: (claim.topics ?? []).flatMap(topic => (topic.toEntityId ? [normId(topic.toEntityId)] : [])),
        keyFrame,
      },
    ];
  });
}

export const nextDebateCandidatesQueryKey = (spaceId: string) => ['debates', 'next-candidates', spaceId] as const;

export type NextDebate = {
  debateId: string;
  spaceId: string;
  claimName: string;
  keyFrame: string | null;
  related: boolean;
  /** Agree side first, as on the card above. Empty if geo-chat couldn't say who argued it. */
  participants: DebateParticipant[];
};

const NO_WATCHED: ReadonlySet<string> = new Set();
const NO_RANKING: ReadonlyMap<string, number> = new Map();

/**
 * The debate the end card offers next, ready to draw — or null while it is being worked out, or when
 * there is nothing to offer.
 *
 * `live` is the end card's own latch: on once the debate has been active, so the suggestion is worked
 * out while the debate plays rather than after it ends. `shown` is whether the card is on screen,
 * which is when the debate counts as watched.
 */
export function useNextDebate(debate: Debate, live: boolean, shown: boolean): NextDebate | null {
  const spaceId = normId(debate.claim.space_id);

  const ranking = useDebatesBestOrder(spaceId, live);
  const candidates = useQuery({
    queryKey: nextDebateCandidatesQueryKey(spaceId),
    queryFn: ({ signal }) =>
      Effect.runPromise(
        graphql({
          query: nextDebateCandidatesDocument,
          decoder: decodeNextDebateCandidates,
          variables: {
            spaceId,
            debateTypeId: DEBATE_TYPE_ID,
            claimsPropertyId: DEBATE_CLAIMS_PROPERTY_ID,
            topicsPropertyId: TOPICS_PROPERTY_ID,
            videosPropertyId: DEBATE_VIDEOS_PROPERTY_ID,
            keyFramePropertyId: KEY_FRAME_IMAGE_PROPERTY_ID,
          },
          signal,
        })
      ),
    enabled: live && Boolean(spaceId),
    // New debates are published minutes apart at most, and a suggestion a few minutes behind is
    // still a good one.
    staleTime: 5 * 60_000,
  });

  // Read once per debate, when it becomes live: the suggestion is worked out while it plays, and
  // re-reading after this debate is marked below would only ever add this debate, which the picker
  // skips anyway.
  const watchedDebateIds = React.useMemo(
    () => (live ? readWatchedDebateIds() : NO_WATCHED),
    // `debate.id` so a player handed a different debate reads again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [live, debate.id]
  );

  React.useEffect(() => {
    if (shown) markDebateWatched(debate.id);
  }, [shown, debate.id]);

  // Held until the ranking has answered, so the suggestion isn't drawn in query order and then
  // swapped for the ranked one. A ranking that failed falls through to query order.
  const settled = candidates.data !== undefined && !ranking.isLoading;
  const pick = React.useMemo(
    () =>
      settled
        ? pickNextDebate({
            candidates: candidates.data ?? [],
            currentDebateId: debate.id,
            currentClaimId: debate.claim.claim_entity_id,
            rankByDebateId: ranking.isError ? NO_RANKING : ranking.rankByDebateId,
            watchedDebateIds,
          })
        : null,
    [
      settled,
      candidates.data,
      debate.id,
      debate.claim.claim_entity_id,
      ranking.isError,
      ranking.rankByDebateId,
      watchedDebateIds,
    ]
  );

  // The debaters' names and faces come from geo-chat: the graph knows them only as the spaces they
  // argued from. The same single-debate read the Explore debate card makes for each card it shows.
  const chosen = useDebate(pick ? ID.hexToUuid(pick.candidate.debateId) : '', live && pick !== null);
  const participants = React.useMemo(
    () =>
      chosen.data
        ? orderedParticipants(chosen.data).sort((left, right) => Number(right.position) - Number(left.position))
        : [],
    [chosen.data]
  );

  if (!pick) return null;
  // Drawn once geo-chat has answered, either way — a row whose names arrive a beat later shifts
  // everything under it. A failed read still offers the debate, just without the faces.
  if (chosen.isLoading) return null;

  return {
    debateId: pick.candidate.debateId,
    spaceId,
    claimName: pick.candidate.claimName,
    keyFrame: pick.candidate.keyFrame,
    related: pick.related,
    participants,
  };
}
