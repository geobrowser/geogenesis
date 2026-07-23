import { cookies } from 'next/headers';

import type { BrowseSidebarData } from '~/core/browse/fetch-browse-sidebar-data';
import { fetchBrowseSidebarData } from '~/core/browse/fetch-browse-sidebar-data';
import { resolveMemberSpaceFromWalletSafe } from '~/core/browse/resolve-member-space-from-wallet';
import { WALLET_ADDRESS } from '~/core/cookie';
import { fetchExploreSidePanelData } from '~/core/explore/fetch-explore-side-panel-data';
import { type FeaturedSpace, fetchFeaturedSpaces } from '~/core/io/subgraph/fetch-featured-spaces';
import { normId } from '~/core/utils/norm-id';

import { ExplorePage } from '~/partials/explore/explore-page';

export default async function ExploreRoutePage() {
  const wallet = (await cookies()).get(WALLET_ADDRESS)?.value;

  let memberSpaceId: string | null = null;
  try {
    memberSpaceId = wallet ? await resolveMemberSpaceFromWalletSafe(wallet) : null;
  } catch {
    memberSpaceId = null;
  }

  // Fire every fetch in parallel. Each branch handles its own failure so one
  // degraded indexer call doesn't drop the whole page.
  const featuredSpacesPromise = fetchFeaturedSpaces().catch(() => [] as FeaturedSpace[]);
  // Reuse the same in-flight Root-topic traversal for the Browse Featured-spaces
  // section and the Explore Join-spaces panel.
  const browsePromise = fetchBrowseSidebarData(memberSpaceId, featuredSpacesPromise).catch(() =>
    fetchBrowseSidebarData(null, featuredSpacesPromise).catch(() => null)
  );
  const sidePanelPromise = fetchExploreSidePanelData({
    wallet,
    memberSpaceId,
    featuredSpacesPromise,
  });

  const [browseRaw, sidePanel] = await Promise.all([browsePromise, sidePanelPromise]);

  const browse: BrowseSidebarData = browseRaw ?? {
    featured: [],
    editorOf: [],
    memberOf: [],
    documentationImage: null,
    personalSpaceId: null,
  };

  const seen = new Set<string>();
  const initialSpaceOptions: { value: string; label: string }[] = [];
  for (const row of [...browse.featured, ...browse.editorOf, ...browse.memberOf]) {
    const k = normId(row.id);
    if (seen.has(k)) continue;
    seen.add(k);
    initialSpaceOptions.push({ value: row.id, label: row.name });
  }

  return (
    <ExplorePage
      initialSpaceOptions={initialSpaceOptions}
      featuredSpaces={sidePanel.featuredSpaces}
      featuredRankings={sidePanel.featuredRankings}
      pendingMembershipSpaceIds={sidePanel.pendingMembershipSpaceIds}
      memberOrEditorSpaceIds={sidePanel.memberOrEditorSpaceIds}
      editorSpaceIds={sidePanel.editorSpaceIds}
      communityCalls={sidePanel.communityCalls}
    />
  );
}
