import { SpaceWithMetadata } from '~/core/types';

export type SpaceToAdd = {
  id: string;
  daoAddress: string;
  spaceConfig: SpaceWithMetadata | null;
  totalMembers: number;
};
