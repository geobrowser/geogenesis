import { cookies } from 'next/headers';

import type { BrowseSidebarData } from '~/core/browse/fetch-browse-sidebar-data';
import { fetchBrowseSidebarData } from '~/core/browse/fetch-browse-sidebar-data';
import { resolveMemberSpaceFromWalletSafe } from '~/core/browse/resolve-member-space-from-wallet';
import { WALLET_ADDRESS } from '~/core/cookie';
import { type ParentTopicOption, fetchParentTopicOptions } from '~/core/io/subgraph/fetch-parent-topic-options';
import { type RootTopicsData, fetchRootTopics } from '~/core/io/subgraph/fetch-root-topics';
import { hasActiveMemberProposal } from '~/core/io/subgraph/fetch-proposed-members';

import { getGovernanceHomeSpaceContext } from '~/app/home/governance-home-space-ids';

import { ExplorePage } from '~/partials/explore/explore-page';

function normId(id: string): string {
  return id.replace(/-/g, '').toLowerCase();
}

export default async function ExploreRoutePage() {
  const wallet = (await cookies()).get(WALLET_ADDRESS)?.value;

  let memberSpaceId: string | null = null;
  try {
    memberSpaceId = wallet ? await resolveMemberSpaceFromWalletSafe(wallet) : null;
  } catch {
    memberSpaceId = null;
  }

  // Kick off every fetch that depends only on `memberSpaceId` in parallel.
  // Each branch handles its own failure so one degraded indexer call doesn't
  // drop the whole page.
  const browsePromise = fetchBrowseSidebarData(memberSpaceId).catch(() =>
    fetchBrowseSidebarData(null).catch(() => null)
  );
  const rootTopicsPromise = fetchRootTopics().catch(
    () => ({ unclaimed: [], recentlyClaimed: [] }) as RootTopicsData
  );
  const parentTopicOptionsPromise = fetchParentTopicOptions().catch(() => [] as ParentTopicOption[]);
  const governancePromise = memberSpaceId
    ? getGovernanceHomeSpaceContext(memberSpaceId).catch(() => null)
    : Promise.resolve(null);

  const [browseRaw, rootTopics, parentTopicOptions, governance] = await Promise.all([
    browsePromise,
    rootTopicsPromise,
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
  if (memberSpaceId && rootTopics.recentlyClaimed.length > 0) {
    const memberOrEditorSet = new Set(memberOrEditorSpaceIds.map(normId));
    const candidates = rootTopics.recentlyClaimed.filter(s => !memberOrEditorSet.has(normId(s.spaceId)));
    const checks = await Promise.all(
      candidates.map(async s => {
        try {
          const active = await hasActiveMemberProposal(s.spaceId, memberSpaceId!);
          return active ? s.spaceId : null;
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
      unclaimedTopics={rootTopics.unclaimed}
      recentlyClaimedSpaces={rootTopics.recentlyClaimed}
      parentTopicOptions={parentTopicOptions}
      pendingMembershipSpaceIds={pendingMembershipSpaceIds}
      memberOrEditorSpaceIds={memberOrEditorSpaceIds}
    />
  );
}
