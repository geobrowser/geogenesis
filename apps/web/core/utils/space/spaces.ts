import { Entity } from '~/core/types';

import { getTopRankedSpaceId } from './space-ranking';

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
