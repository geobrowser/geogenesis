import { Duration } from 'effect';

import { SearchResult } from '../io/dto/search';
import { EntityId } from '../io/schema';
import { fetchResult, fetchSpaces } from '../io/subgraph';
import { queryClient } from '../query-client';
import { getEntities_experimental } from './entities';

export interface FetchResultOptions {
  id: EntityId;
  signal?: AbortController['signal'];
}

export async function mergeSearchResult(args: FetchResultOptions) {
  const localEntities = await getEntities_experimental();

  const localOnlyEntitiesSet = new Set(Object.values(localEntities).map(e => e.id));

  const cachedRemoteResult = await queryClient.fetchQuery({
    queryKey: ['merge-search-result', args],
    queryFn: () =>
      fetchResult({
        id: args.id,
        signal: args.signal,
      }),
    staleTime: Duration.toMillis(Duration.seconds(15)),
  });

  const maybeLocalVersionExists = localOnlyEntitiesSet.has(args.id);

  let merged = cachedRemoteResult
    ? maybeLocalVersionExists
      ? { ...localEntities[args.id], spaces: cachedRemoteResult.spaces }
      : cachedRemoteResult
    : maybeLocalVersionExists
      ? localEntities[args.id]
      : null;

  const localOnlyEntitySpaceIds = !cachedRemoteResult
    ? maybeLocalVersionExists
      ? localEntities[args.id].nameTripleSpaces
      : []
    : [];

  const localEntitySpaces = await queryClient.fetchQuery({
    queryKey: ['merge-local-entity-spaces', localOnlyEntitySpaceIds],
    queryFn: () => fetchSpaces({ spaceIds: localOnlyEntitySpaceIds }),
    staleTime: Duration.toMillis(Duration.seconds(15)),
  });

  const localEntitySpacesBySpaceId = Object.fromEntries(localEntitySpaces.map(s => [s.id, s.spaceConfig]));

  if (maybeLocalVersionExists && merged) {
    merged = {
      ...merged,
      spaces: localEntities[args.id].nameTripleSpaces
        .map(spaceId => {
          return localEntitySpacesBySpaceId[spaceId] ?? null;
        })
        .filter(s => s !== null),
    };
  }

  return merged as SearchResult | null;
}
