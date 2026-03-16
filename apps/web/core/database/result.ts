import { Duration, Effect } from 'effect';

import { ROOT_SPACE } from '../constants';
import { getBatchEntities, getResult, getSpaces } from '../io/queries';
import { queryClient } from '../query-client';
import { GeoStore } from '../sync/store';
import { SearchResult } from '../types';
import { Entities } from '../utils/entity';
import { sortSpaceIdsByRank } from '../utils/space/space-ranking';

interface FetchResultOptions {
  id: string;
  store: GeoStore;
  signal?: AbortController['signal'];
}

export async function mergeSearchResult(args: FetchResultOptions) {
  const localEntity = args.store.getEntity(args.id);

  const cachedRemoteResult = await queryClient.fetchQuery({
    queryKey: ['merge-search-result', args],
    queryFn: () => Effect.runPromise(getResult(args.id)),
    staleTime: Duration.toMillis(Duration.seconds(15)),
  });

  let merged = cachedRemoteResult
    ? localEntity
      ? { ...localEntity, spaces: cachedRemoteResult.spaces }
      : cachedRemoteResult
    : localEntity
      ? localEntity
      : null;

  if (!merged) {
    return null;
  }

  // Collect all space IDs from both local and remote entities
  const allSpaceIds = [
    ...(localEntity?.spaces || []),
    ...(cachedRemoteResult?.spaces?.map(s => (typeof s === 'string' ? s : s.spaceId)) || []),
  ];
  const uniqueSpaceIds = [...new Set(allSpaceIds)];

  // Fetch space entities for all space IDs
  const spaceEntities = await queryClient.fetchQuery({
    queryKey: ['merge-search-result-spaces', uniqueSpaceIds],
    queryFn: () => Effect.runPromise(getSpaces({ spaceIds: uniqueSpaceIds })),
    staleTime: Duration.toMillis(Duration.seconds(15)),
  });

  const spaceEntitiesBySpaceId = Object.fromEntries(spaceEntities.map(s => [s.id, s.entity]));

  const sortedSpaceIds = sortSpaceIdsByRank(uniqueSpaceIds);
  merged = {
    ...merged,
    spaces: sortedSpaceIds.map(spaceId => spaceEntitiesBySpaceId[spaceId]).filter(s => s !== undefined),
  };

  // @TODO remove once the backend resolves type names using space ranking
  if (merged.types && merged.types.length > 0) {
    const typeNameMap = new Map<string, string>();
    const unresolvedTypeIds: string[] = [];

    for (const type of merged.types) {
      const localTypeEntity = args.store.getEntity(type.id);
      if (localTypeEntity?.name) {
        typeNameMap.set(type.id, localTypeEntity.name);
      } else if (!unresolvedTypeIds.includes(type.id)) {
        unresolvedTypeIds.push(type.id);
      }
    }

    if (unresolvedTypeIds.length > 0) {
      try {
        const rootSpaceEntities = await queryClient.fetchQuery({
          queryKey: ['network', 'entities', 'type-names', ROOT_SPACE, unresolvedTypeIds.sort().join(',')],
          queryFn: () => Effect.runPromise(getBatchEntities(unresolvedTypeIds, ROOT_SPACE)),
          staleTime: Duration.toMillis(Duration.seconds(15)),
        });

        for (const entity of rootSpaceEntities) {
          const nameFromValues = Entities.name(entity.values);
          const resolvedName = nameFromValues ?? entity.name;
          if (resolvedName) {
            typeNameMap.set(entity.id, resolvedName);
          }
        }
      } catch {}
    }

    if (typeNameMap.size > 0) {
      merged = {
        ...merged,
        types: merged.types.map(t => {
          const resolvedName = typeNameMap.get(t.id);
          return resolvedName !== undefined ? { ...t, name: resolvedName } : t;
        }),
      };
    }
  }

  return merged as SearchResult;
}
