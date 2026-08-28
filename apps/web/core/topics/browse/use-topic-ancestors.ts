'use client';

import * as React from 'react';

import { SUBTOPIC_RELATION_TYPE_ID, TOPIC_TYPE_ID } from '~/core/constants';
import { sortClaimsByBest, useClaimsBestOrder } from '~/core/debates/claims-best-order';
import { useQueryEntities } from '~/core/sync/use-store';
import type { Entity } from '~/core/types';

import { UNNAMED_SUBTOPIC_PROPERTY_ID } from '../ontology';

/**
 * How far up the hierarchy the crumb will walk.
 *
 * Each level is its own request — the graph stores parentage as a relation pointing *down*, so
 * there is no way to ask for a whole chain in one go. Five is past the depth any curated topic
 * reaches, and a fixed number is what lets this be hooks rather than a loop.
 */
const MAX_DEPTH = 5;

/**
 * One rung of the walk: whoever names `childId` as a subtopic.
 *
 * A topic can be a subtopic of several — the hierarchy is a graph, not a tree — so the candidates
 * are ranked and the best one taken. Ranking a bounded set of ids already in hand is a lookup
 * rather than a scan, which is the one shape the ranked connection serves properly (GEO-2720).
 */
function useParentTopic(childId: string | null, spaceId: string | null): Entity | null {
  const { entities } = useQueryEntities({
    where: {
      // Both hierarchy properties, for the same reason the subtopic list reads both: which one a
      // topic was written with varies, and reading only the named one loses the parent entirely on
      // topics written with the other.
      OR: [
        {
          relations: [
            { typeOf: { id: { equals: SUBTOPIC_RELATION_TYPE_ID } }, toEntity: { id: { equals: childId ?? '' } } },
          ],
        },
        {
          relations: [
            { typeOf: { id: { equals: UNNAMED_SUBTOPIC_PROPERTY_ID } }, toEntity: { id: { equals: childId ?? '' } } },
          ],
        },
      ],
    },
    // More than one, deliberately. A topic can be a subtopic of several — the hierarchy is a graph,
    // not a tree — and asking for one hands back whichever the query happened to order first, which
    // is what made the same topic show different paths on different loads.
    first: 10,
    enabled: Boolean(childId),
  });

  const candidateIds = React.useMemo(() => entities.map(entity => entity.id), [entities]);
  const { rankByClaimId } = useClaimsBestOrder(candidateIds, spaceId, TOPIC_TYPE_ID);

  // Ranked rather than sorted by id. Both are stable, which is what fixed the path changing between
  // visits — but ranking picks the parent the feed considers most significant rather than whichever
  // id happens to sort first, so a topic sits under its most prominent parent.
  return React.useMemo(() => sortClaimsByBest(entities, rankByClaimId)[0] ?? null, [entities, rankByClaimId]);
}

/**
 * The full path from the root down to this topic's parent, outermost first.
 *
 * Walks up a rung at a time. A topic can sit several levels deep — `U.S. elections` under
 * `Global affairs`, and its own subtopics under it — and showing only the immediate parent reads as
 * though the hierarchy is one level, which is what it looked like before.
 *
 * Cycles are possible in user-authored data and would otherwise walk until the depth cap, so a
 * topic already seen ends the walk.
 */
export function useTopicAncestors(topicId: string, spaceId: string | null): Entity[] {
  // A fixed number of rungs, called unconditionally. The walk is data-dependent but the hook count
  // cannot be: each level is enabled only once the one below it has produced a parent.
  const first = useParentTopic(topicId, spaceId);
  const second = useParentTopic(first?.id ?? null, spaceId);
  const third = useParentTopic(second?.id ?? null, spaceId);
  const fourth = useParentTopic(third?.id ?? null, spaceId);
  const fifth = useParentTopic(fourth?.id ?? null, spaceId);

  return React.useMemo(() => {
    const chain: Entity[] = [];
    const seen = new Set<string>([topicId]);

    for (const ancestor of [first, second, third, fourth, fifth].slice(0, MAX_DEPTH)) {
      if (!ancestor || seen.has(ancestor.id)) break;
      seen.add(ancestor.id);
      chain.push(ancestor);
    }

    // Collected child-upward; a crumb reads root-downward.
    return chain.reverse();
  }, [fifth, first, fourth, second, third, topicId]);
}
