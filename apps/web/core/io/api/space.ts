import { Environment } from '~/core/environment';
import { Space } from '~/core/types';

import { fetchSpace } from '../subgraph';

interface NetworkData {
  space: Space | null;
  isPermissionlessSpace: boolean;
}

export async function space(spaceId: string): Promise<NetworkData> {
  const config = Environment.getConfig(process.env.NEXT_PUBLIC_APP_ENV);
  const space = await fetchSpace({ endpoint: config.api, id: spaceId });

  return {
    space,
    isPermissionlessSpace: false,
  };
}
