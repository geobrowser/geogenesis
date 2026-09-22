import { cookies } from 'next/headers';

import type { BrowseSidebarData } from '~/core/browse/fetch-browse-sidebar-data';
import { fetchBrowseSidebarData } from '~/core/browse/fetch-browse-sidebar-data';
import { resolveMemberSpaceFromWalletSafe } from '~/core/browse/resolve-member-space-from-wallet';
import { WALLET_ADDRESS } from '~/core/cookie';
import { normId } from '~/core/utils/norm-id';

import { getGovernanceHomeSpaceContext } from '~/app/home/governance-home-space-ids';

/** Auth and visible-space scope shared by the Topic feed and its Topic facet counts. */
export async function resolveTopicFeedRequestContext(routeSpaceId: string) {
  const walletAddress = (await cookies()).get(WALLET_ADDRESS)?.value ?? null;
  let personalMemberSpaceId: string | null = null;
  let memberOrEditorSpaceIds: string[] = [];

  if (walletAddress) {
    personalMemberSpaceId = await resolveMemberSpaceFromWalletSafe(walletAddress);
    if (personalMemberSpaceId) {
      try {
        const context = await getGovernanceHomeSpaceContext(personalMemberSpaceId);
        memberOrEditorSpaceIds = [
          ...new Set([...context.editorIds, ...context.myProposalSpaceIds, personalMemberSpaceId]),
        ];
      } catch {
        memberOrEditorSpaceIds = [personalMemberSpaceId];
      }
    }
  }

  let browse: BrowseSidebarData;
  try {
    browse = await fetchBrowseSidebarData(personalMemberSpaceId);
  } catch {
    browse = {
      featured: [],
      editorOf: [],
      memberOf: [],
      documentationImage: null,
      personalSpaceId: null,
    };
  }

  const visibleSpaceIds = new Set(
    [...browse.featured, ...browse.editorOf, ...browse.memberOf].map(space => normId(space.id))
  );
  if (!visibleSpaceIds.has(normId(routeSpaceId))) {
    browse = {
      ...browse,
      featured: [{ id: routeSpaceId, name: routeSpaceId.slice(0, 8), image: null }, ...browse.featured],
    };
  }

  return { browse, memberOrEditorSpaceIds, walletAddress };
}
