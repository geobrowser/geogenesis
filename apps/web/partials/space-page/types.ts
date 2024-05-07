import { SpaceWithMetadata } from '~/core/types';

export type SpaceToAdd = {
  id: string;
  spaceConfig: SpaceWithMetadata | null;
  totalMembers: number;
};
