import { pipe } from 'effect';
import { dedupeWith } from 'effect/Array';

import { PLACEHOLDER_SPACE_IMAGE } from '../constants';
import { SearchResult } from '../io/dto/search';
import { SpaceConfigEntity } from '../io/dto/spaces';
import { EntityId } from '../io/schema';
import { FetchResultsOptions, fetchResults } from '../io/subgraph';
import { queryClient } from '../query-client';
import { Entities } from '../utils/entity';
import { groupBy } from '../utils/utils';
import { mergeEntity, readTypes } from './entities';
import { getRelations } from './relations';
import { getTriples } from './triples';

/**
 * Fetch the results of a search query with any local representations
 * of space.
 *
 * We only need to merge existing spaces and not any locally created
 * spaces since there's not really a concept of a locally created space.
 * Spaces should be created async and resolve. A user could change an
 * entity to type Space, but we don't really track that for now.
 *
 * 1. ~~Fetch the results from the server~~
 * 2. Merge the results with the local state
 * 3. Add any spaces for an entity that were added or removed locally
 * 4. Filter by the filterByTypes
 */
export async function mergeResultsAsync(options: FetchResultsOptions): Promise<SearchResult[]> {
  const cachedResults = await queryClient.fetchQuery({
    queryKey: ['search-results'],
    queryFn: async () => {
      const results = await fetchResults(options);
      return results;
    },
    staleTime: Infinity,
  });

  const spacesInResults = pipe(
    cachedResults.flatMap(result => result.spaces),
    dedupeWith((a, b) => a.id === b.id),
    spaces =>
      spaces.map((space): SpaceConfigEntity => {
        const mergedEntity = mergeEntity({ id: space.id, mergeWith: space });

        return {
          ...mergedEntity,
          spaceId: space.id,
          image:
            Entities.avatar(mergedEntity.relationsOut) ??
            Entities.cover(mergedEntity.relationsOut) ??
            PLACEHOLDER_SPACE_IMAGE,
        };
      }),
    spaces => groupBy(spaces, s => s.spaceId)
  );

  return (
    cachedResults
      // Merge the remote results with the local state with the SearchResult
      // data structure.
      // @TODO: We currently don't include any entities that were changed to
      // be included in the search results. Right now we only merge local
      // state with the remote query.
      .map((result): SearchResult => {
        const mergedTriples = getTriples({
          selector: t => t.entityId === result.id,
        });

        const mergedRelations = getRelations({
          selector: r => r.fromEntity.id === result.id,
        });

        // Use the merged triples to derive the name instead of the remote entity
        // `name` property in case the name was deleted/changed locally.
        const name = Entities.name(mergedTriples) ?? result.name;
        const description = Entities.description(mergedTriples) ?? result.description;
        const types = readTypes(mergedRelations);
        const spaces = result.spaces.flatMap(space => spacesInResults[space.spaceId] ?? []);

        return {
          id: EntityId(result.id),
          name,
          description,
          types,
          // @TODO: Add or remove spaces based on local state changes.
          spaces: spaces,
        };
      })
      // Apply any filters to the results again to include any changes
      // in the local state.
      .filter(result => {
        const filters: ('QUERY' | 'TYPES')[] = [];

        if (options.query) {
          filters.push('QUERY');
        }

        if (options.typeIds) {
          filters.push('TYPES');
        }

        return filters.every(filterType => {
          if (filterType === 'QUERY') {
            return hasQuery(options.query ?? '', result) !== false;
          }

          if (filterType === 'TYPES') {
            return (
              hasType(
                options.typeIds ?? [],
                result.types.map(t => t.id)
              ) !== false
            );
          }
        });
      })
  );
}

function hasType(filterByIds: string[], typeIds: string[]) {
  const typeIdsSet = new Set(typeIds);
  return filterByIds.some(t => typeIdsSet.has(t));
}

function hasQuery(query: string, result: SearchResult) {
  if (query === '') {
    return true;
  }

  return result.name?.toLowerCase().includes(query.toLocaleLowerCase());
}
