import { Space } from '~/core/types';

import { fetchSpace } from '../subgraph';

interface NetworkData {
  space: Space | null;
  isPermissionlessSpace: boolean;
}

export async function space(spaceId: string): Promise<NetworkData> {
  const space = await fetchSpace({ id: spaceId });

  return {
    space,
    isPermissionlessSpace: false,
  };
}
