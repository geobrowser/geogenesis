import { cache } from 'react';

import { cookies } from 'next/headers';

import { resolveMemberSpaceFromWalletSafe } from '~/core/browse/resolve-member-space-from-wallet';
import { type ExploreCall, fetchCommunityCallsForExplore } from '~/core/community-calls/fetch-community-calls';
import { WALLET_ADDRESS } from '~/core/cookie';
import { type FeaturedRanking, fetchFeaturedRankings } from '~/core/io/subgraph/fetch-featured-rankings';
import { type FeaturedSpace, fetchFeaturedSpacesShared } from '~/core/io/subgraph/fetch-featured-spaces';
import { fetchActiveMemberRequest } from '~/core/io/subgraph/fetch-proposed-members';
import { mapWithConcurrency } from '~/core/utils/map-with-concurrency';
import { normId } from '~/core/utils/norm-id';
import { createPromiseTtlCache } from '~/core/utils/promise-ttl-cache';

import { getGovernanceHomeSpaceContext } from '~/app/home/governance-home-space-ids';

export type ExploreSidePanelData = {
  featuredSpaces: FeaturedSpace[];
  featuredRankings: FeaturedRanking[];
  pendingMembershipSpaceIds: string[];
  memberOrEditorSpaceIds: string[];
  communityCalls: ExploreCall[];
};

/**
 * Rankings and calls are the same for every reader, so one load serves a minute of visitors rather
 * than each page view repeating it. Featured spaces already share theirs (`fetchFeaturedSpacesShared`).
 * Only the reader's own membership and pending requests below stay per request.
 */
const SHARED_SIDE_PANEL_TTL_MS = 60_000;
const featuredRankingsCache = createPromiseTtlCache<FeaturedRanking[]>({
  ttlMs: SHARED_SIDE_PANEL_TTL_MS,
  maxEntries: 1,
});
const communityCallsCache = createPromiseTtlCache<ExploreCall[]>({ ttlMs: SHARED_SIDE_PANEL_TTL_MS, maxEntries: 1 });

export const fetchExploreSidePanelData = cache(async (): Promise<ExploreSidePanelData> => {
  // Started before the wallet lookup, which they don't depend on.
  const featuredSpacesPromise = fetchFeaturedSpacesShared().catch(() => [] as FeaturedSpace[]);
  const featuredRankingsPromise = featuredRankingsCache
    .get('featured', fetchFeaturedRankings)
    .catch(() => [] as FeaturedRanking[]);
  const communityCallsPromise = communityCallsCache
    .get('explore', fetchCommunityCallsForExplore)
    .catch(() => [] as ExploreCall[]);
  const wallet = (await cookies()).get(WALLET_ADDRESS)?.value ?? null;
  let memberSpaceId: string | null;
  try {
    memberSpaceId = wallet ? await resolveMemberSpaceFromWalletSafe(wallet) : null;
  } catch {
    memberSpaceId = null;
  }

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
});
