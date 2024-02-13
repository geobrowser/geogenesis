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
  return await api.fetchTableRowEntities({
    signal,
    first: params.first,
    skip: params.skip,
    filter: params.filter,
  });
}
