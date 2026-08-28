'use client';

import * as React from 'react';

import { SUBTOPIC_RELATION_TYPE_ID } from '~/core/constants';
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

/** One rung of the walk: whoever names `childId` as a subtopic. */
function useParentTopic(childId: string | null): Entity | null {
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
    first: 1,
    enabled: Boolean(childId),
  });

  return entities[0] ?? null;
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
export function useTopicAncestors(topicId: string): Entity[] {
  // A fixed number of rungs, called unconditionally. The walk is data-dependent but the hook count
  // cannot be: each level is enabled only once the one below it has produced a parent.
  const first = useParentTopic(topicId);
  const second = useParentTopic(first?.id ?? null);
  const third = useParentTopic(second?.id ?? null);
  const fourth = useParentTopic(third?.id ?? null);
  const fifth = useParentTopic(fourth?.id ?? null);

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
