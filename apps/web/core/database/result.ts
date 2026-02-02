import { Duration, Effect } from 'effect';

import { getResult, getSpaces } from '../io/queries';
import { queryClient } from '../query-client';
import { GeoStore } from '../sync/store';
import { SearchResult } from '../types';

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

  console.log('remote', cachedRemoteResult);

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

  console.log('spaces', spaceEntities);

  const spaceEntitiesBySpaceId = Object.fromEntries(spaceEntities.map(s => [s.id, s.entity]));

  // Map space IDs to space entities
  merged = {
    ...merged,
    spaces: uniqueSpaceIds.map(spaceId => spaceEntitiesBySpaceId[spaceId]).filter(s => s !== undefined),
  };

  return merged as SearchResult;
}
