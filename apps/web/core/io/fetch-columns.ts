import { SYSTEM_IDS } from '@geogenesis/sdk';

import { DEFAULT_PAGE_SIZE } from '~/core/state/triple-store/constants';

import { Subgraph } from '.';
import { Column } from '../types';
import { Values } from '../utils/value';

interface FetchColumnsOptions {
  api: {
    fetchTriples: Subgraph.ISubgraph['fetchTriples'];
    fetchEntity: Subgraph.ISubgraph['fetchEntity'];
  };
  params: Subgraph.FetchTableRowEntitiesOptions & {
    skip: number;
    first: number;
  };
  signal?: AbortController['signal'];
}

export async function fetchColumns({ params, api, signal }: FetchColumnsOptions) {
  if (params.typeIds?.length === 0) {
    return [];
  }

  const columnsTriples = await api.fetchTriples({
    query: '',
    signal,
    first: DEFAULT_PAGE_SIZE,
    skip: 0,
    filter: [
      { field: 'entity-id', value: params.typeIds?.[0] ?? '' },
      { field: 'attribute-id', value: SYSTEM_IDS.ATTRIBUTES },
    ],
  });

  /* Then we fetch all of the associated triples for each column */

  // This will return null if the entity we're fetching does not exist remotely
  // @TODO: The value might be a collection
  const columnsEntityIds = columnsTriples
    .map(t => Values.entitiesForEntityOrCollectionItems(t))
    // @TODO: Yes this is a monstrosity
    .flatMap(t => (t ? [t] : []))
    .flat();

  const maybeRelatedColumnTriples = await Promise.all(columnsEntityIds.map(c => api.fetchEntity({ id: c.id })));

  const relatedColumnTriples = maybeRelatedColumnTriples.flatMap(entity => (entity ? [entity] : []));

  const schemaColumns: Column[] = columnsTriples.map((triple, i) => ({
    id: triple.value.value,
    triples: relatedColumnTriples[i].triples,
  }));

  return [
    {
      id: SYSTEM_IDS.NAME,
      triples: [],
    },
    ...schemaColumns,
  ];
}
