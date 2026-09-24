import { cookies } from 'next/headers';

import type { BrowseSidebarData } from '~/core/browse/fetch-browse-sidebar-data';
import { fetchBrowseSidebarData } from '~/core/browse/fetch-browse-sidebar-data';
import { resolveMemberSpaceFromWalletSafe } from '~/core/browse/resolve-member-space-from-wallet';
import { WALLET_ADDRESS } from '~/core/cookie';
import { normId } from '~/core/utils/norm-id';

import { getGovernanceHomeSpaceContext } from '~/app/home/governance-home-space-ids';

/**
 * What a reader can see when we could not find out what they can see.
 *
 * `featuredError` is the part that matters rather than the empty rows: for a signed-out reader the
 * Featured list is the whole of Explore's space scope, so an empty one here is not "you belong to
 * nothing" but "we do not know", and `fetchExploreFeed` has to be able to tell those apart before
 * it decides whether an empty feed is an honest answer.
 */
const EMPTY_BROWSE: BrowseSidebarData = {
  featured: [],
  editorOf: [],
  memberOf: [],
  documentationImage: null,
  personalSpaceId: null,
  featuredError: true,
};

/** Auth, memberships, and visible spaces shared by Explore and contextual Topic feeds. */
export async function resolveExploreFeedRequestContext(routeSpaceId?: string) {
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
    if (personalMemberSpaceId) {
      try {
        browse = await fetchBrowseSidebarData(null);
      } catch {
        browse = EMPTY_BROWSE;
      }
    } else {
      browse = EMPTY_BROWSE;
    }
  }

  if (routeSpaceId) {
    const visibleSpaceIds = new Set(
      [...browse.featured, ...browse.editorOf, ...browse.memberOf].map(space => normId(space.id))
    );
    if (!visibleSpaceIds.has(normId(routeSpaceId))) {
      browse = {
        ...browse,
        featured: [{ id: routeSpaceId, name: routeSpaceId.slice(0, 8), image: null }, ...browse.featured],
      };
    }
  }

  return { browse, memberOrEditorSpaceIds, walletAddress };
}
