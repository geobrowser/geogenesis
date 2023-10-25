import { Environment } from '~/core/environment';
import { Space } from '~/core/types';

import { fetchSpace } from '../subgraph';

interface NetworkData {
  space: Space | null;
  isPermissionlessSpace: boolean;
}

export async function space(spaceId: string): Promise<NetworkData> {
  const config = Environment.getConfig(process.env.NEXT_PUBLIC_APP_ENV);
  let space = await fetchSpace({ endpoint: config.subgraph, id: spaceId });
  let isPermissionlessSpace = false;

  if (!space) {
    space = await fetchSpace({ endpoint: config.permissionlessSubgraph, id: spaceId });
    if (space) isPermissionlessSpace = true;
  }

  return {
    space,
    isPermissionlessSpace,
  };
}
