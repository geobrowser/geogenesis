import { SYSTEM_IDS } from '@geogenesis/sdk';

import { DEFAULT_PAGE_SIZE } from '~/core/state/triple-store/constants';

import { getSchemaFromTypeIds,  } from '../database/entities';

interface FetchColumnsOptions {
  typeIds: string[];
}

export async function fetchColumns({ typeIds }: FetchColumnsOptions) {
  return await getSchemaFromTypeIds(typeIds);
}
