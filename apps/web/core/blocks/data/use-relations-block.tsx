import { SystemIds } from '@geoprotocol/geo-sdk/lite';
import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { Effect } from 'effect';

import { RelationFilter, RelationsOrderBy } from '~/core/gql/graphql';
import { getRelationsConnection } from '~/core/io/queries';

import { Filter } from './filters';
import { Source } from './source';

type UseRelationsBlockOptions = {
  source: Source;
  filterState: Filter[];
  first: number;
  after?: string;
  offset?: number;
  spaceId: string;
};

export function useRelationsBlock({ source, filterState, first, after, offset, spaceId }: UseRelationsBlockOptions) {
  const relationFilter = getRelationsConnectionFilter(source, filterState, spaceId);

  const { data, isLoading, isFetched, isPlaceholderData } = useQuery({
    enabled: source.type === 'RELATIONS' && relationFilter !== null,
    placeholderData: keepPreviousData,
    queryKey: ['blocks', 'data', 'relations-connection', source, relationFilter, first, after, offset],
    queryFn: async ({ signal }) => {
      if (!relationFilter) {
        return { relations: [], endCursor: null, hasNextPage: false };
      }

      return await Effect.runPromise(
        getRelationsConnection(
          {
            filter: relationFilter,
            first,
            after,
            offset,
            orderBy: [RelationsOrderBy.PositionAsc, RelationsOrderBy.IdAsc],
          },
          signal
        )
      );
    },
  });

  return {
    relationBlockSourceRelations: data?.relations ?? [],
    endCursor: data?.endCursor ?? null,
    hasNextPage: data?.hasNextPage ?? false,
    isLoading,
    isFetched: source.type !== 'RELATIONS' || relationFilter === null || isFetched,
    isPlaceholderData,
  };
}

function getRelationsConnectionFilter(source: Source, filterState: Filter[], spaceId: string): RelationFilter | null {
  if (source.type !== 'RELATIONS') {
    return null;
  }

  const maybeFilter = filterState.find(f => f.columnId === SystemIds.RELATION_TYPE_PROPERTY);
  const relationType = maybeFilter?.value;

  if (!source.value || !relationType) {
    return null;
  }

  return {
    fromEntityId: { is: source.value },
    typeId: { is: relationType },
    spaceId: { is: spaceId },
  };
}
