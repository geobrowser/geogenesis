import { Subgraph } from '.';

export interface FetchRowsOptions {
  api: {
    fetchTableRowEntities: Subgraph.ISubgraph['fetchTableRowEntities'];
  };
  params: Subgraph.FetchTableRowEntitiesOptions & {
    skip: number;
    first: number;
  };
  abortController?: AbortController;
}

export async function fetchRows({ params, abortController, api }: FetchRowsOptions) {
  if (params.typeIds?.length === 0) {
    return [];
  }

  return await api.fetchTableRowEntities({
    endpoint: params.endpoint,
    abortController,
    first: params.first,
    skip: params.skip,
    typeIds: params.typeIds,
    filter: params.filter,
  });
}
