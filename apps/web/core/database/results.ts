import { Array, Duration } from 'effect';

import { Entity } from '../io/dto/entities';
import { SearchResult } from '../io/dto/search';
import { EntityId } from '../io/schema';
import { fetchResults, fetchSpaces } from '../io/subgraph';
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

  const localOnlyEntitiesWithFilter = new Set(
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
    const maybeLocalVersionExists = localOnlyEntitiesWithFilter.has(e.id);

    if (maybeLocalVersionExists) {
      const localEntity = localEntities[e.id];

      return {
        ...localEntity,
        spaces: e.spaces,
      };
    }

    return e;
  });

  /**
   * Some entities might _only_ exist locally, so we need to map those
   * into the {@link SearchResult} struct to return to the caller.
   */
  const localOnlyEntityIds = Array.difference(
    [...localOnlyEntitiesWithFilter],
    merged.map(m => m.id)
  );

  const localOnlyEntities = localOnlyEntityIds.map((entityId): Entity => {
    return localEntities[EntityId(entityId)];
  });

  const localOnlyEntitySpaceIds = localOnlyEntities.flatMap(e => e.nameTripleSpaces);

  // Is it more optimal to do this in parallel with the cachedRemoteResults?
  // We might end up fetching more data but get the data we need sooner.
  const localEntitySpaces = await queryClient.fetchQuery({
    queryKey: ['merge-local-entity-spaces', localOnlyEntitySpaceIds],
    queryFn: () => fetchSpaces({ spaceIds: localOnlyEntitySpaceIds }),
    staleTime: Duration.toMillis(Duration.seconds(15)),
  });

  const localEntitySpacesBySpaceId = Object.fromEntries(localEntitySpaces.map(s => [s.id, s.spaceConfig]));

  const localResults = localOnlyEntities.map((e): SearchResult => {
    return {
      ...e,
      spaces: e.nameTripleSpaces
        .map(spaceId => {
          return localEntitySpacesBySpaceId[spaceId] ?? null;
        })
        .filter(s => s !== null),
    };
  });

  return [...localResults, ...merged];
}
