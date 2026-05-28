import type { Space } from '~/core/io/dto/spaces';
import { Entity } from '~/core/types';

import { getTopRankedSpaceId } from './space-ranking';

export { getTopRankedSpaceId };

/**
 * A space has an "external" topic when its topicId points to a different
 * entity than the space's own page entity. Many spaces set their topic to
 * themselves (topicId === entity.id) which should be treated as no topic.
 */
export const hasExternalTopic = (
  space: Pick<Space, 'topicId' | 'entity'> | null | undefined
): space is Pick<Space, 'topicId' | 'entity'> & { topicId: string } => {
  return Boolean(space?.topicId && space.topicId !== space.entity?.id);
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
