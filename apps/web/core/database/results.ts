import { Duration } from 'effect';

import { fetchResults } from '../io/subgraph';
import { queryClient } from '../query-client';
import { getEntities_experimental } from './entities';

export interface FetchResultsOptions {
  name?: string;
  typeIds?: string[];
  first?: number;
  signal?: AbortController['signal'];
}

export async function mergeSearchResults(args: FetchResultsOptions) {
  const localEntities = getEntities_experimental();

  const cachedRemoteEntities = await queryClient.fetchQuery({
    queryKey: ['merge-search-results', args],
    queryFn: () => fetchResults(args),
    staleTime: Duration.toMillis(Duration.seconds(15)),
  });

  return cachedRemoteEntities;
}
