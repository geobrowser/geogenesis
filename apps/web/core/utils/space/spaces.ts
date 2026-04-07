import type { Space } from '~/core/io/dto/spaces';
import { Entity } from '~/core/types';

import { getTopRankedSpaceId } from './space-ranking';

/**
 * A space has an "external" topic when its topicId points to a different
 * entity than the space's own page entity. Many spaces set their topic to
 * themselves (topicId === entity.id) which should be treated as no topic.
 */
export const hasExternalTopic = (space: Space | null | undefined): space is Space & { topicId: string } => {
  return Boolean(space?.topicId && space.topicId !== space.entity?.id);
};

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
