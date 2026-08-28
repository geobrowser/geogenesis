import { cache } from 'react';

import { cookies } from 'next/headers';

import { resolveMemberSpaceFromWalletSafe } from '~/core/browse/resolve-member-space-from-wallet';
import { type ExploreCall, fetchCommunityCallsForExplore } from '~/core/community-calls/fetch-community-calls';
import { WALLET_ADDRESS } from '~/core/cookie';
import { type FeaturedRanking, fetchFeaturedRankings } from '~/core/io/subgraph/fetch-featured-rankings';
import { type FeaturedSpace, fetchFeaturedSpaces } from '~/core/io/subgraph/fetch-featured-spaces';
import { fetchActiveMemberRequest } from '~/core/io/subgraph/fetch-proposed-members';
import { mapWithConcurrency } from '~/core/utils/map-with-concurrency';
import { normId } from '~/core/utils/norm-id';

import { getGovernanceHomeSpaceContext } from '~/app/home/governance-home-space-ids';

export type ExploreSidePanelData = {
  featuredSpaces: FeaturedSpace[];
  featuredRankings: FeaturedRanking[];
  pendingMembershipSpaceIds: string[];
  memberOrEditorSpaceIds: string[];
  communityCalls: ExploreCall[];
};

type FetchExploreSidePanelDataOptions = {
  memberSpaceId?: string | null;
  featuredSpacesPromise?: Promise<FeaturedSpace[]>;
};

export const fetchExploreSidePanelData = cache(
  async (options: FetchExploreSidePanelDataOptions = {}): Promise<ExploreSidePanelData> => {
    let memberSpaceId: string | null;
    if (options.memberSpaceId !== undefined) {
      memberSpaceId = options.memberSpaceId;
    } else {
      const wallet = (await cookies()).get(WALLET_ADDRESS)?.value ?? null;
      try {
        memberSpaceId = wallet ? await resolveMemberSpaceFromWalletSafe(wallet) : null;
      } catch {
        memberSpaceId = null;
      }
    }

    const featuredSpacesPromise =
      options.featuredSpacesPromise ?? fetchFeaturedSpaces().catch(() => [] as FeaturedSpace[]);
    const featuredRankingsPromise = fetchFeaturedRankings().catch(() => [] as FeaturedRanking[]);
    const communityCallsPromise = fetchCommunityCallsForExplore().catch(() => [] as ExploreCall[]);
    const governancePromise = memberSpaceId
      ? getGovernanceHomeSpaceContext(memberSpaceId).catch(() => null)
      : Promise.resolve(null);

    const [featuredSpaces, featuredRankings, communityCalls, governance] = await Promise.all([
      featuredSpacesPromise,
      featuredRankingsPromise,
      communityCallsPromise,
      governancePromise,
    ]);

    const memberOrEditorSpaceIds: string[] = memberSpaceId
      ? governance
        ? [...new Set([...governance.editorIds, ...governance.myProposalSpaceIds, memberSpaceId])]
        : [memberSpaceId]
      : [];

    let pendingMembershipSpaceIds: string[] = [];
    if (memberSpaceId) {
      const memberOrEditorSet = new Set(memberOrEditorSpaceIds.map(normId));
      const candidateIds = new Map<string, string>();
      for (const s of featuredSpaces) {
        const normalized = normId(s.spaceId);
        if (memberOrEditorSet.has(normalized) || candidateIds.has(normalized)) continue;
        candidateIds.set(normalized, s.spaceId);
      }
      const checks = await mapWithConcurrency([...candidateIds.values()], 8, async spaceId => {
        try {
          const req = await fetchActiveMemberRequest(spaceId, memberSpaceId!);
          return req != null && !req.isVotingEnded ? spaceId : null;
        } catch {
          return null;
        }
      });
      pendingMembershipSpaceIds = checks.filter((id): id is string => id !== null);
    }

    const rankingSpaceAllowlist = new Set([
      ...featuredSpaces.map(space => normId(space.spaceId)),
      ...memberOrEditorSpaceIds.map(normId),
    ]);
    const visibleFeaturedRankings = featuredRankings.filter(ranking =>
      rankingSpaceAllowlist.has(normId(ranking.spaceId))
    );

    return {
      featuredSpaces,
      featuredRankings: visibleFeaturedRankings,
      pendingMembershipSpaceIds,
      memberOrEditorSpaceIds,
      communityCalls,
    };
  }
);
