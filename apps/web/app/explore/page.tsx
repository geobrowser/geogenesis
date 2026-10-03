import { cookies } from 'next/headers';

import { resolveMemberSpaceFromWalletSafe } from '~/core/browse/resolve-member-space-from-wallet';
import { readWalletCookie } from '~/core/cookie/wallet-session';
import { fetchExploreSidePanelData } from '~/core/explore/fetch-explore-side-panel-data';
import { type FeaturedSpace, fetchFeaturedSpacesShared } from '~/core/io/subgraph/fetch-featured-spaces';

import { ExplorePage } from '~/partials/explore/explore-page';

export default async function ExploreRoutePage() {
  const wallet = readWalletCookie(await cookies());

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
