import { QueryClient, dehydrate } from '@tanstack/react-query';
import type { DehydratedState } from '@tanstack/react-query';

import { fetchProfileFacts, profileFactsQueryKey } from '~/core/io/subgraph/fetch-profile-facts';
import { fetchProfileHistory, profileHistoryQueryKey } from '~/core/io/subgraph/fetch-profile-history';
import type { ProfileFacts } from '~/core/profile/profile-facts';

import type { PersonRecordCounts } from '~/partials/space-page/space-tabs';

export type ProfilePrefetch = {
  /**
   * The four counts behind the profile's tabs, so the ones holding nothing are
   * not drawn (GEO-2859).
   *
   * `undefined` when the read failed, and `buildSpaceTabs` reads that as "show
   * everything". A count that could not be read must not be mistaken for a
   * record that is empty — hiding a tab holding hundreds of rows is the one
   * outcome worse than showing one holding none.
   *
   * Narrowed here rather than handing the whole `ProfileFacts` back, because the
   * tab bar is the only caller that cannot get them from the cache below.
   */
  recordCounts: PersonRecordCounts | undefined;
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
 * Handed over through React Query rather than as `initial*` props, which is how
 * this route seeds `RouteEditorProvider` and `SpaceTabs`. Those have one
 * consumer each, directly below them. These two have several, in subtrees the
 * layout cannot reach: the facts are read by the rail, by the About route, by
 * the record tabs' side panel and by the Activity card, and the history by the
 * headline in the layout *and* the sections in the page. Threading a prop to
 * each is the same cache by hand, with a fetch per branch that missed one.
 *
 * Failures are swallowed on purpose. `dehydrate` carries successful queries
 * only, so a read that fails here simply isn't in the handover and the hook
 * makes its own request exactly as it does today — including the error states
 * both of them draw. A profile must not fail to render because a count could
 * not be counted.
 */
export async function prefetchProfileQueries(spaceId: string, personEntityId: string): Promise<ProfilePrefetch> {
  /*
   * Per request, never shared: this client exists only to be dehydrated, and a
   * module-level one would hand one reader's profile to the next.
   *
   * `retry: false` for the same reason `core/query-client.tsx` cuts React
   * Query's default to one — `core/io/graphql-client.ts` already retries
   * transport failures on its own jittered schedule, and stacking a second
   * budget on top of it here would hold the page's HTML rather than a hook's
   * loading state. A read that fails simply isn't in the handover.
   */
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

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

  const facts = queryClient.getQueryData<ProfileFacts>(factsKey);

  return {
    recordCounts: facts && {
      debates: facts.debates,
      totalDebates: facts.totalDebates,
      positions: facts.positions,
      proposals: facts.proposals,
    },
    dehydratedState: dehydrate(queryClient),
  };
}
