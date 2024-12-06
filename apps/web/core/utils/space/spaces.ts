import { Entity } from '~/core/io/dto/entities';
import { SpaceId } from '~/core/io/schema';

export const getValidSpaceIdForEntity = (entity: Entity) => {
  const validSpaces = (entity?.spaces ?? []) as SpaceId[];
  // @TODO replace with ranking algorithm
  const spaceId = getRandomSpaceId(validSpaces);

  return spaceId;
};

const getRandomSpaceId = (spaceIds: SpaceId[]) => {
  const randomIndex = crypto.getRandomValues(new Uint32Array(1))[0] % spaceIds.length;

  return spaceIds[randomIndex];
};
