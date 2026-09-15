import type { Space } from '~/core/io/dto/spaces';
import { Entity } from '~/core/types';

import { getTopRankedSpaceId } from './space-ranking';

export { getTopRankedSpaceId };

/**
 * A space has an "external" topic when its topicId points to a different
 * entity than the space's own page entity. Many spaces set their topic to
 * themselves (topicId === entity.id) which should be treated as no topic.
 *
 * ⚠️ **This cannot return true for a space whose topic resolved.** `SpaceDto`
 * builds `entity` from `topic ?? page`, so a space with a topic has
 * `entity.id === topicId` by construction, and this comparison is false. The
 * only way through it is a topic that *failed to decode* and fell back to the
 * page — exactly backwards from what the name promises. See
 * {@link hasTopicEntity}, and GEO-2913 for untangling the four callers.
 */
export const hasExternalTopic = (
  space: Pick<Space, 'topicId' | 'entity'> | null | undefined
): space is Pick<Space, 'topicId' | 'entity'> & { topicId: string } => {
  return Boolean(space?.topicId && space.topicId !== space.entity?.id);
};

/**
 * Whether a space's subject is an entity of its own, rather than the space.
 *
 * What {@link hasExternalTopic} was reaching for, asked of the field that
 * actually carries the answer. A personal space with one is a person: 180 of
 * the 905 personal spaces, the rest having `topicId: null` and so no person
 * entity to render a profile from.
 */
export const hasTopicEntity = (
  space: Pick<Space, 'topicId'> | null | undefined
): space is Pick<Space, 'topicId'> & { topicId: string } => {
  return Boolean(space?.topicId);
};

/** Entity at the root of a space's subtopic tree (homepage, or external topic). */
export function getSpaceSubtopicRootEntityId(space: Pick<Space, 'topicId' | 'entity'>): string {
  if (hasExternalTopic(space)) {
    return space.topicId;
  }

  return space.entity.id;
}

export const getValidSpaceIdForEntity = (entity: Entity) => {
  const validSpaces = entity?.spaces ?? [];
  return getTopRankedSpaceId(validSpaces);
};

export const getDeterministicSpaceId = (spaceIds: string[], preferredSpaceId?: string) => {
  if (spaceIds.length === 0) {
    return null;
  }

  if (preferredSpaceId && spaceIds.includes(preferredSpaceId)) {
    return preferredSpaceId;
  }

  return getTopRankedSpaceId(spaceIds);
};
