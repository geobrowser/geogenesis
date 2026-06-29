import { cookies } from 'next/headers';

import type { BrowseSidebarData } from '~/core/browse/fetch-browse-sidebar-data';
import { fetchBrowseSidebarData } from '~/core/browse/fetch-browse-sidebar-data';
import { resolveMemberSpaceFromWalletSafe } from '~/core/browse/resolve-member-space-from-wallet';
import { WALLET_ADDRESS } from '~/core/cookie';
import { type RootTopicChip, fetchFirstLevelSubtopics } from '~/core/io/subgraph/fetch-first-level-subtopics';
import { type ParentTopicOption, fetchParentTopicOptions } from '~/core/io/subgraph/fetch-parent-topic-options';
import { fetchActiveMemberRequest } from '~/core/io/subgraph/fetch-proposed-members';
import {
  type RecentlyClaimedSpace,
  fetchRecentlyClaimedSpaces,
} from '~/core/io/subgraph/fetch-recently-claimed-spaces';
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
  //
  // - recentlyClaimedPromise: spaces that recently claimed a curated topic.
  // - firstLevelSubtopicsPromise: powers "Any topic" — a parent → subtopic
  //   traversal that's not bounded by the global curated-topics page size.
  // - parentTopicOptionsPromise: dropdown options.
  const browsePromise = fetchBrowseSidebarData(memberSpaceId).catch(() =>
    fetchBrowseSidebarData(null).catch(() => null)
  );
  const recentlyClaimedPromise = fetchRecentlyClaimedSpaces().catch(() => [] as RecentlyClaimedSpace[]);
  const firstLevelSubtopicsPromise = fetchFirstLevelSubtopics().catch(() => [] as RootTopicChip[]);
  const parentTopicOptionsPromise = fetchParentTopicOptions().catch(() => [] as ParentTopicOption[]);
  const governancePromise = memberSpaceId
    ? getGovernanceHomeSpaceContext(memberSpaceId).catch(() => null)
    : Promise.resolve(null);

  const [browseRaw, recentlyClaimedSpaces, firstLevelSubtopics, parentTopicOptions, governance] = await Promise.all([
    browsePromise,
    recentlyClaimedPromise,
    firstLevelSubtopicsPromise,
    parentTopicOptionsPromise,
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

  // For recently-claimed spaces the user isn't already part of, check whether they
  // have an active ADD_MEMBER proposal so the Join button can render "Membership
  // pending" without a client roundtrip.
  let pendingMembershipSpaceIds: string[] = [];
  if (memberSpaceId && recentlyClaimedSpaces.length > 0) {
    const memberOrEditorSet = new Set(memberOrEditorSpaceIds.map(normId));
    const candidates = recentlyClaimedSpaces.filter(s => !memberOrEditorSet.has(normId(s.spaceId)));
    const checks = await Promise.all(
      candidates.map(async s => {
        try {
          // Only an open vote is "pending"; a stuck request lets the Join button reappear.
          const req = await fetchActiveMemberRequest(s.spaceId, memberSpaceId!);
          return req != null && !req.isVotingEnded ? s.spaceId : null;
        } catch {
          return null;
        }
      })
    );
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
      unclaimedTopics={firstLevelSubtopics}
      recentlyClaimedSpaces={recentlyClaimedSpaces}
      parentTopicOptions={parentTopicOptions}
      pendingMembershipSpaceIds={pendingMembershipSpaceIds}
      memberOrEditorSpaceIds={memberOrEditorSpaceIds}
    />
  );
}
