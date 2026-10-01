'use client';

import * as React from 'react';

import { useDebateKeyframes } from '~/core/claims/browse/use-debate-keyframes';
import type { Debate } from '~/core/debates/api';
import { debateClaimIds, nextDebateCandidates, pickNextDebate } from '~/core/debates/next-debate';
import {
  DEBATE_OPPOSED_BY_PROPERTY_ID,
  DEBATE_SUPPORTED_BY_PROPERTY_ID,
  DEBATE_TYPE_ID,
} from '~/core/debates/ontology';
import { useWatchedDebateIds } from '~/core/debates/watched-debates';
import { useProfilesBySpaceIds } from '~/core/hooks/use-profiles-by-space-ids';
import { useQueryEntities } from '~/core/sync/use-store';
import { Entities } from '~/core/utils/entity';
import { normId } from '~/core/utils/norm-id';

import { useDebatesBestOrder } from './use-debates-best-order';

/**
 * How many of a space's debates the picker considers.
 *
 * The busiest space on testnet holds a few dozen. Set well above that, and explicitly, because a
 * list query without `first` silently stops at a hundred.
 */
const CANDIDATE_LIMIT = 500;

export type NextDebate = {
  debateId: string;
  spaceId: string;
  claimName: string;
  keyFrame: string | null;
  related: boolean;
  /** Supported by first, as the Agree side sits first everywhere on the card. */
  participants: { spaceId: string; name: string | null; avatarUrl: string | null }[];
};

const NO_WATCHED: ReadonlySet<string> = new Set();
const NO_RANKING: ReadonlyMap<string, number> = new Map();

/**
 * The debate the end card offers next, ready to draw — or null while it is being worked out, or when
 * there is nothing to offer.
 *
 * Read from the graph the way the claim and topic pages list debates: the space's Debate entities,
 * their claims for topics, the key frame through `useDebateKeyframes`, and the sides' names and
 * faces through `useProfilesBySpaceIds`. The same queries on the same keys, so a viewer who has been
 * on either page gets a cache read.
 *
 * `live` is the end card's own latch: on once the debate has been active, so the suggestion is worked
 * out while the debate plays rather than after it ends. The watched list is subscribed to, so a
 * debate finished anywhere drops out of the suggestion at once. Recording a finished debate is the
 * player's — see `DebateFeedPlayer` — because a compact tile finishes debates without ever showing
 * this card.
 */
export function useNextDebate(debate: Debate, live: boolean): NextDebate | null {
  const spaceId = normId(debate.claim.space_id);

  const ranking = useDebatesBestOrder(spaceId, live);
  const { entities: debates, isLoading: debatesLoading } = useQueryEntities({
    where: { types: [{ id: { equals: DEBATE_TYPE_ID } }], spaces: [{ equals: spaceId }] },
    first: CANDIDATE_LIMIT,
    enabled: live && Boolean(spaceId),
  });

  // Each debate's claim, for its name and its topics in this space. Batched across the space.
  const claimIds = React.useMemo(() => debateClaimIds(debates, spaceId), [debates, spaceId]);
  const { entities: claims, isLoading: claimsLoading } = useQueryEntities({
    where: { id: { in: claimIds } },
    first: claimIds.length || 1,
    enabled: live && claimIds.length > 0,
  });
  const candidates = React.useMemo(() => nextDebateCandidates(debates, claims, spaceId), [claims, debates, spaceId]);

  // Kept current rather than read once: see `useWatchedDebateIds`.
  const watched = useWatchedDebateIds();
  const watchedDebateIds = live ? watched : NO_WATCHED;

  // Held until everything the choice rests on has answered, so the suggestion isn't drawn off a
  // partial list and then swapped. A ranking that failed falls through to query order.
  const settled =
    live && !debatesLoading && !ranking.isLoading && !(claimIds.length > 0 && claimsLoading) && debates.length > 0;
  const pick = React.useMemo(
    () =>
      settled
        ? pickNextDebate({
            candidates,
            currentDebateId: debate.id,
            currentClaimId: debate.claim.claim_entity_id,
            rankByDebateId: ranking.isError ? NO_RANKING : ranking.rankByDebateId,
            watchedDebateIds,
          })
        : null,
    [
      settled,
      candidates,
      debate.id,
      debate.claim.claim_entity_id,
      ranking.isError,
      ranking.rankByDebateId,
      watchedDebateIds,
    ]
  );

  // Scoped to this space before anything reads it, as the candidates were: another space's Videos or
  // Supported by on the same debate would otherwise pick the key frame or name a debater.
  const chosen = React.useMemo(
    () =>
      pick
        ? debates
            .filter(entity => normId(entity.id) === pick.candidate.debateId)
            .map(entity => ({ ...entity, relations: Entities.relationsInSpace(entity.relations, spaceId) }))
        : [],
    [debates, pick, spaceId]
  );
  const keyframeByDebateId = useDebateKeyframes(chosen);

  // The sides as the graph publishes them, as `ClaimDebates` reads them.
  const sides = React.useMemo(
    () =>
      chosen.flatMap(entity => [
        ...Entities.relationTargets(entity.relations, DEBATE_SUPPORTED_BY_PROPERTY_ID),
        ...Entities.relationTargets(entity.relations, DEBATE_OPPOSED_BY_PROPERTY_ID),
      ]),
    [chosen]
  );
  const { profilesBySpaceId, isLoading: profilesLoading } = useProfilesBySpaceIds(sides, sides.length > 0);

  if (!pick || chosen.length === 0) return null;
  // Drawn once the names are in either way — a row whose names arrive a beat later shifts everything
  // under it. Profiles that could not be resolved still leave the faces, keyed by space.
  if (profilesLoading) return null;

  return {
    debateId: pick.candidate.debateId,
    spaceId,
    claimName: pick.candidate.claimName,
    keyFrame: keyframeByDebateId.get(chosen[0].id) ?? null,
    related: pick.related,
    participants: sides.map(sideSpaceId => {
      const profile = profilesBySpaceId.get(sideSpaceId);
      return { spaceId: sideSpaceId, name: profile?.name ?? null, avatarUrl: profile?.avatarUrl ?? null };
    }),
  };
}
