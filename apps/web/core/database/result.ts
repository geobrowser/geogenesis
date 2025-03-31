import { Duration } from 'effect';

import { SearchResult } from '../io/dto/search';
import { EntityId } from '../io/schema';
import { fetchResult, fetchSpaces } from '../io/subgraph';
import { queryClient } from '../query-client';
import { GeoStore } from '../sync/store';

export interface FetchResultOptions {
  id: EntityId;
  store: GeoStore;
  signal?: AbortController['signal'];
}

export async function mergeSearchResult(args: FetchResultOptions) {
  const localEntity = args.store.getEntity(args.id);

  const cachedRemoteResult = await queryClient.fetchQuery({
    queryKey: ['merge-search-result', args],
    queryFn: () =>
      fetchResult({
        id: args.id,
        signal: args.signal,
      }),
    staleTime: Duration.toMillis(Duration.seconds(15)),
  });

  let merged = cachedRemoteResult
    ? localEntity
      ? { ...localEntity, spaces: cachedRemoteResult.spaces }
      : cachedRemoteResult
    : localEntity
      ? localEntity
      : null;

  const localOnlyEntitySpaceIds = !cachedRemoteResult ? (localEntity ? localEntity.nameTripleSpaces : []) : [];

  const localEntitySpaces = await queryClient.fetchQuery({
    queryKey: ['merge-local-entity-spaces', localOnlyEntitySpaceIds],
    queryFn: () => fetchSpaces({ spaceIds: localOnlyEntitySpaceIds }),
    staleTime: Duration.toMillis(Duration.seconds(15)),
  });

  const localEntitySpacesBySpaceId = Object.fromEntries(localEntitySpaces.map(s => [s.id, s.spaceConfig]));

  if (localEntity && merged) {
    merged = {
      ...merged,
      spaces: localEntity.nameTripleSpaces
        .map(spaceId => {
          return localEntitySpacesBySpaceId[spaceId] ?? null;
        })
        .filter(s => s !== null),
    };
  }

  return merged as SearchResult | null;
}
