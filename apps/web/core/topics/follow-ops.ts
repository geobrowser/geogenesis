import { createEntityId } from '~/core/id/create-id';
import type { Relation } from '~/core/types';
import { normId } from '~/core/utils/norm-id';

import { FOLLOWING_PROPERTY, FOLLOWING_PROPERTY_NAME } from './ontology';

/** A topic to follow. `spaceId` is recorded as `toSpaceId` when the caller knows it. */
export type TopicRef = {
  id: string;
  name?: string | null;
  spaceId?: string;
};

/** One stored `Following` row, as read back from the personal space. */
export type FollowedTopicRelation = {
  id: string;
  spaceId: string;
  toEntityId: string;
};

/**
 * Follow rows for every topic not already followed, deduped within the input,
 * so a whole selection publishes as one edit.
 */
export function buildFollowRelations(args: {
  personalSpaceId: string;
  topics: readonly TopicRef[];
  existingTopicIds: ReadonlySet<string>;
}): { followed: FollowedTopicRelation[]; relations: Relation[] } {
  const seen = new Set([...args.existingTopicIds].map(normId));
  const followed: FollowedTopicRelation[] = [];
  const relations: Relation[] = [];

  for (const topic of args.topics) {
    const key = normId(topic.id);
    if (seen.has(key)) continue;
    seen.add(key);

    const id = createEntityId();
    followed.push({ id, spaceId: args.personalSpaceId, toEntityId: topic.id });
    relations.push({
      id,
      entityId: createEntityId(),
      spaceId: args.personalSpaceId,
      ...(topic.spaceId ? { toSpaceId: topic.spaceId } : {}),
      renderableType: 'RELATION',
      fromEntity: { id: args.personalSpaceId, name: null },
      toEntity: { id: topic.id, name: topic.name ?? null, value: topic.id },
      type: { id: FOLLOWING_PROPERTY, name: FOLLOWING_PROPERTY_NAME },
      isLocal: true,
    });
  }

  return { followed, relations };
}

/** Tombstones every row for the given topics, so duplicates from an earlier race go too. */
export function buildUnfollowRelations(args: {
  personalSpaceId: string;
  rows: readonly FollowedTopicRelation[];
  topicIds: readonly string[];
}): Relation[] {
  const targets = new Set(args.topicIds.map(normId));

  return args.rows
    .filter(row => targets.has(normId(row.toEntityId)))
    .map(row => ({
      id: row.id,
      entityId: createEntityId(),
      spaceId: row.spaceId,
      renderableType: 'RELATION' as const,
      fromEntity: { id: args.personalSpaceId, name: null },
      toEntity: { id: row.toEntityId, name: null, value: row.toEntityId },
      type: { id: FOLLOWING_PROPERTY, name: FOLLOWING_PROPERTY_NAME },
      isLocal: true,
      isDeleted: true,
    }));
}
