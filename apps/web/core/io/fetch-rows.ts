import { Subgraph } from '.';

export interface FetchRowsOptions {
  api: {
    fetchTableRowEntities: Subgraph.ISubgraph['fetchTableRowEntities'];
  };
  params: Subgraph.FetchTableRowEntitiesOptions & {
    skip: number;
    first: number;
  };
  signal?: AbortController['signal'];
}

export async function fetchRows({ params, signal, api }: FetchRowsOptions) {
  if (params.typeIds?.length === 0) {
    return [];
  }

  return await api.fetchTableRowEntities({
    endpoint: params.endpoint,
    signal,
    first: params.first,
    skip: params.skip,
    typeIds: params.typeIds,
    filter: params.filter,
  });
}
