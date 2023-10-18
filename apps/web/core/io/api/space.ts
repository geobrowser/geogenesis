import { Space } from '~/core/types';

import { fetcher } from './geo-fetch';

interface NetworkData {
  space: Space | null;
  isPermissionlessSpace: boolean;
}

export async function space(spaceId: string): Promise<NetworkData> {
  return fetcher<NetworkData>(`/api/space/${spaceId}`);
}
