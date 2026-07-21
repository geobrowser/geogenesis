import { cookies } from 'next/headers';

import type { BrowseSidebarData } from '~/core/browse/fetch-browse-sidebar-data';
import { fetchBrowseSidebarData } from '~/core/browse/fetch-browse-sidebar-data';
import { resolveMemberSpaceFromWalletSafe } from '~/core/browse/resolve-member-space-from-wallet';
import { type ExploreCall, fetchCommunityCallsForExplore } from '~/core/community-calls/fetch-community-calls';
import { WALLET_ADDRESS } from '~/core/cookie';
import { type FeaturedRanking, fetchFeaturedRankings } from '~/core/io/subgraph/fetch-featured-rankings';
import { type FeaturedSpace, fetchFeaturedSpaces } from '~/core/io/subgraph/fetch-featured-spaces';
import { fetchActiveMemberRequest } from '~/core/io/subgraph/fetch-proposed-members';
import { mapWithConcurrency } from '~/core/utils/map-with-concurrency';
import { normId } from '~/core/utils/norm-id';

import { ExplorePage } from '~/partials/explore/explore-page';

import { getGovernanceHomeSpaceContext } from '~/app/home/governance-home-space-ids';

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
  const featuredRankingsPromise = fetchFeaturedRankings().catch(() => [] as FeaturedRanking[]);
  const communityCallsPromise = fetchCommunityCallsForExplore().catch(() => [] as ExploreCall[]);
  const governancePromise = memberSpaceId
    ? getGovernanceHomeSpaceContext(memberSpaceId).catch(() => null)
    : Promise.resolve(null);

  const [browseRaw, featuredSpaces, featuredRankings, communityCalls, governance] = await Promise.all([
    browsePromise,
    featuredSpacesPromise,
    featuredRankingsPromise,
    communityCallsPromise,
    governancePromise,
  ]);

  const browse: BrowseSidebarData = browseRaw ?? {
    featured: [],
    editorOf: [],
    memberOf: [],
    documentationImage: null,
    personalSpaceId: null,
  };

  const memberOrEditorSpaceIds: string[] = memberSpaceId
    ? governance
      ? [...new Set([...governance.editorIds, ...governance.myProposalSpaceIds, memberSpaceId])]
      : [memberSpaceId]
    : [];
  const editorSpaceIds: string[] = governance ? governance.editorIds : [];

  // For featured spaces the user isn't already part of, check
  // whether they have an active ADD_MEMBER proposal so the Join button can render
  // "Membership pending" without a client roundtrip.
  let pendingMembershipSpaceIds: string[] = [];
  if (memberSpaceId) {
    const memberOrEditorSet = new Set(memberOrEditorSpaceIds.map(normId));
    const candidateIds = new Map<string, string>();
    for (const s of featuredSpaces) {
      const normalized = normId(s.spaceId);
      if (memberOrEditorSet.has(normalized) || candidateIds.has(normalized)) continue;
      candidateIds.set(normalized, s.spaceId);
    }
    // Cap concurrency: with up to ~60 featured + recently-claimed candidates this
    // is one REST call each, and an unbounded fan-out would burst the indexer.
    const checks = await mapWithConcurrency([...candidateIds.values()], 8, async spaceId => {
      try {
        // Only an open vote is "pending"; a stuck request lets the Join button reappear.
        const req = await fetchActiveMemberRequest(spaceId, memberSpaceId!);
        return req != null && !req.isVotingEnded ? spaceId : null;
      } catch {
        return null;
      }
    });
    pendingMembershipSpaceIds = checks.filter((id): id is string => id !== null);
  }

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
      featuredSpaces={featuredSpaces}
      featuredRankings={featuredRankings}
      pendingMembershipSpaceIds={pendingMembershipSpaceIds}
      memberOrEditorSpaceIds={memberOrEditorSpaceIds}
      editorSpaceIds={editorSpaceIds}
      communityCalls={communityCalls}
    />
  );
}
