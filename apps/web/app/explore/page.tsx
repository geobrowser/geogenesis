import { cookies } from 'next/headers';
import { preload } from 'react-dom';

import { resolveMemberSpaceFromWalletSafe } from '~/core/browse/resolve-member-space-from-wallet';
import { WALLET_ADDRESS } from '~/core/cookie';
import { fetchExploreSidePanelData } from '~/core/explore/fetch-explore-side-panel-data';
import { type FeaturedSpace, fetchFeaturedSpacesShared } from '~/core/io/subgraph/fetch-featured-spaces';

import { ExplorePage } from '~/partials/explore/explore-page';

/**
 * The request the Best feed makes on mount (`fetchFeedPage` with only `sort=best`, credentials
 * included). The client can't send it until the whole bundle, Privy and wagmi among it, has
 * downloaded and hydrated, about 2s into a cold load. Preloading it from the HTML starts it on
 * first parse, and the feed's own `fetch` adopts the in-flight response. Skipped when For you opens
 * the page, which asks for something else.
 */
const BEST_FEED_PRELOAD_HREF = '/api/explore/feed?sort=best';

export default async function ExploreRoutePage() {
  if (process.env.NEXT_PUBLIC_FOR_YOU_ENABLED !== 'true') {
    preload(BEST_FEED_PRELOAD_HREF, { as: 'fetch', crossOrigin: 'use-credentials' });
  }
  const wallet = (await cookies()).get(WALLET_ADDRESS)?.value;

  let memberSpaceId: string | null = null;
  try {
    memberSpaceId = wallet ? await resolveMemberSpaceFromWalletSafe(wallet) : null;
  } catch {
    memberSpaceId = null;
  }

  // The side panel handles its own failures, so one degraded indexer call doesn't drop the page.
  const featuredSpacesPromise = fetchFeaturedSpacesShared().catch(() => [] as FeaturedSpace[]);
  const sidePanel = await fetchExploreSidePanelData({
    memberSpaceId,
    featuredSpacesPromise,
  });

  return (
    <ExplorePage
      featuredSpaces={sidePanel.featuredSpaces}
      featuredRankings={sidePanel.featuredRankings}
      pendingMembershipSpaceIds={sidePanel.pendingMembershipSpaceIds}
      memberOrEditorSpaceIds={sidePanel.memberOrEditorSpaceIds}
      communityCalls={sidePanel.communityCalls}
      signedIn={Boolean(wallet)}
    />
  );
}
