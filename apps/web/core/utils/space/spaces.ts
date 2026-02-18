import { Entity } from '~/core/types';

export const getValidSpaceIdForEntity = (entity: Entity) => {
  const validSpaces = entity?.spaces ?? [];
  // @TODO replace with ranking algorithm
  const spaceId = getRandomSpaceId(validSpaces);

  return spaceId;
};

export const getDeterministicSpaceId = (spaceIds: string[], preferredSpaceId?: string) => {
  if (spaceIds.length === 0) {
    return null;
  }

  if (preferredSpaceId && spaceIds.includes(preferredSpaceId)) {
    return preferredSpaceId;
  }

  return spaceIds[0];
};

const getRandomSpaceId = (spaceIds: string[]) => {
  const randomIndex = crypto.getRandomValues(new Uint32Array(1))[0] % spaceIds.length;

  return spaceIds[randomIndex];
};
