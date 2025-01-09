import { getSchemaFromTypeIds } from '../database/entities';

interface FetchColumnsOptions {
  typeIds: string[];
}

export async function fetchColumns({ typeIds }: FetchColumnsOptions) {
  return await getSchemaFromTypeIds(typeIds);
}
