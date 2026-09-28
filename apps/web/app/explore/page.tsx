import { cookies } from 'next/headers';

import type { BrowseSidebarData } from '~/core/browse/fetch-browse-sidebar-data';
import { fetchBrowseSidebarData } from '~/core/browse/fetch-browse-sidebar-data';
import { resolveMemberSpaceFromWalletSafe } from '~/core/browse/resolve-member-space-from-wallet';
import { WALLET_ADDRESS } from '~/core/cookie';
import { browseSidebarMemberSpaceIds } from '~/core/debates/claim-space-allowlist';
import { fetchExploreSidePanelData } from '~/core/explore/fetch-explore-side-panel-data';
import { type FeaturedSpace, fetchFeaturedSpacesShared } from '~/core/io/subgraph/fetch-featured-spaces';
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
  const featuredSpacesPromise = fetchFeaturedSpacesShared().catch(() => [] as FeaturedSpace[]);
  // Reuse the same in-flight Root-topic traversal for the Browse Featured-spaces
  // section and the Explore Join-spaces panel.
  const browsePromise = fetchBrowseSidebarData(memberSpaceId, featuredSpacesPromise).catch(() =>
    fetchBrowseSidebarData(null, featuredSpacesPromise).catch(() => null)
  );
  const sidePanelPromise = fetchExploreSidePanelData({
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

  // Joined, or with a membership still pending — the spaces the filter opens on (GEO-2789). One
  // set because the reader does not experience the difference: they chose the space at sign-up and
  // it is theirs from that moment, whether or not an approval has landed yet.
  //
  // Read off `browse`, the same rows that build the menu above, and through the same helper the
  // debates surfaces use — so the two cannot disagree about what "yours" means, and a space cannot
  // be offered as an option without being recognised as one of theirs. The side panel's
  // `pendingMembershipSpaceIds` looks like the obvious source and is not: it only checks pending
  // requests against *featured* spaces, so a pending membership anywhere else was listed on the
  // menu and left unticked.
  const memberSpaceIds = [...browseSidebarMemberSpaceIds(browse, browse.personalSpaceId)];

  return (
    <ExplorePage
      initialSpaceOptions={initialSpaceOptions}
      memberSpaceIds={memberSpaceIds}
      featuredSpaces={sidePanel.featuredSpaces}
      featuredRankings={sidePanel.featuredRankings}
      pendingMembershipSpaceIds={sidePanel.pendingMembershipSpaceIds}
      memberOrEditorSpaceIds={sidePanel.memberOrEditorSpaceIds}
      communityCalls={sidePanel.communityCalls}
    />
  );
}
