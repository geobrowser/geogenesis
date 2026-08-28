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
    // More than one, deliberately. A topic can be a subtopic of several — the hierarchy is a graph,
    // not a tree — and asking for one hands back whichever the query happened to order first, which
    // is what made the same topic show different paths on different loads.
    first: 10,
    enabled: Boolean(childId),
  });

  // Pick the same parent every time. Ordering by id is arbitrary but *stable*, which is the property
  // that matters: a breadcrumb that changes between visits is worse than one that picks a defensible
  // branch and sticks to it. A curated-parent preference would be better and needs the tag on the
  // candidates, which this projection doesn't carry.
  return React.useMemo(() => {
    if (entities.length === 0) return null;
    return [...entities].sort((a, b) => a.id.localeCompare(b.id))[0] ?? null;
  }, [entities]);
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
