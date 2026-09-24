import { QueryClient, dehydrate } from '@tanstack/react-query';
import type { DehydratedState } from '@tanstack/react-query';

import { fetchProfileFacts, profileFactsQueryKey } from '~/core/io/subgraph/fetch-profile-facts';
import { fetchProfileHistory, profileHistoryQueryKey } from '~/core/io/subgraph/fetch-profile-history';
import type { ProfileFacts } from '~/core/profile/profile-facts';

/**
 * How long a hydrated read counts as fresh on the client.
 *
 * The same minute both hooks already set for themselves. Stated here because a
 * hydrated query carries the `dataUpdatedAt` this render gave it, and the value
 * only decides whether the client immediately asks again — which is the whole
 * point of handing it over.
 */
const PROFILE_STALE_TIME = 60_000;

export type ProfilePrefetch = {
  /** The counts, for the tab bar. `null` when the read failed. */
  facts: ProfileFacts | null;
  /** What the client's `QueryClient` picks up on mount. */
  dehydratedState: DehydratedState;
};

/**
 * The two profile reads, made once on the server and handed to the client
 * (GEO profile load).
 *
 * Both were already happening, just later and in a worse place. The layout read
 * the facts for its tab counts and threw the rest away, so the rail asked the
 * graph the same seven-alias question a second time after hydration — and the
 * history was read only on the client, which is why the headline under the name
 * arrived a round trip after the page and pushed the tab bar and everything
 * under it down by the height of a person's current roles.
 *
 * Handing both over closes that: the About card, the headline and the Experience
 * and Education sections are complete in the first client paint, and the page
 * makes two fewer requests.
 *
 * Failures are swallowed on purpose. `dehydrate` carries successful queries
 * only, so a read that fails here simply isn't in the handover and the hook
 * makes its own request exactly as it does today — including the error states
 * both of them draw. A profile must not fail to render because a count could
 * not be counted.
 */
export async function prefetchProfileQueries(spaceId: string, personEntityId: string): Promise<ProfilePrefetch> {
  const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: PROFILE_STALE_TIME, retry: false } } });

  const factsKey = profileFactsQueryKey(spaceId, personEntityId);

  await Promise.all([
    queryClient.prefetchQuery({ queryKey: factsKey, queryFn: () => fetchProfileFacts(spaceId, personEntityId) }),
    // Skipped rather than requested with an empty id, which the hook's own
    // `enabled` guard already refuses.
    personEntityId === ''
      ? Promise.resolve()
      : queryClient.prefetchQuery({
          queryKey: profileHistoryQueryKey(personEntityId, spaceId),
          queryFn: () => fetchProfileHistory(personEntityId, spaceId),
        }),
  ]);

  return {
    facts: queryClient.getQueryData<ProfileFacts>(factsKey) ?? null,
    dehydratedState: dehydrate(queryClient),
  };
}
