import { Array, Duration } from 'effect';

import { SearchResult } from '../io/dto/search';
import { SpaceMetadataDto } from '../io/dto/spaces';
import { EntityId } from '../io/schema';
import { fetchResults } from '../io/subgraph';
import { queryClient } from '../query-client';
import { getEntities_experimental } from './entities';

type Filter =
  | {
      type: 'NAME';
      value: string;
    }
  | {
      type: 'TYPES';
      value: string[];
    };

export interface FetchResultsOptions {
  filters: Filter[];
  first?: number;
  signal?: AbortController['signal'];
}

export async function mergeSearchResults(args: FetchResultsOptions) {
  const localEntities = await getEntities_experimental();

  const localEntitiesWithFilter = new Set(
    Object.values(localEntities)
      .filter(e => {
        const nameInsensitive = e.name?.toLowerCase() ?? '';

        return args.filters.every(f => {
          switch (f.type) {
            case 'NAME':
              return nameInsensitive.startsWith(f.value);
            case 'TYPES': {
              if (f.value.length === 0) {
                return true;
              }
              const expectedTypeIds = f.value;
              const existingTypeIds = e.types.map(t => t.id);
              return expectedTypeIds.every(t => existingTypeIds.includes(EntityId(t)));
            }
          }
        });
      })
      .map(e => e.id)
  );

  const cachedRemoteResults = await queryClient.fetchQuery({
    queryKey: ['merge-search-results', args],
    queryFn: () =>
      fetchResults({
        query: args.filters.find(f => f.type === 'NAME')?.value,
        typeIds: args.filters.find(f => f.type === 'TYPES')?.value,
        signal: args.signal,
        first: args.first,
      }),
    staleTime: Duration.toMillis(Duration.seconds(15)),
  });

  // Merge entities that exist remotely with the local version. We have
  // already merged the entity in localEntities and really only care about
  // adding any space metadata.
  const merged = cachedRemoteResults.map((e): SearchResult => {
    const maybeLocalVersionExists = localEntitiesWithFilter.has(e.id);

    if (maybeLocalVersionExists) {
      const localEntity = localEntities[e.id];

      return {
        ...localEntity,
        spaces: e.spaces,
      };
    }

    return e;
  });

  const localEntitiesThatDontExistRemotely = Array.difference(
    [...localEntitiesWithFilter],
    merged.map(m => m.id)
  );

  // @TODO fetch space for the local spaces
  const localResults = localEntitiesThatDontExistRemotely.map((entityId): SearchResult => {
    const entity = localEntities[EntityId(entityId)];

    return {
      ...entity,
      spaces: entity.nameTripleSpaces.map(s => SpaceMetadataDto(s, null)),
    };
  });

  return [...localResults, ...cachedRemoteResults];
}
