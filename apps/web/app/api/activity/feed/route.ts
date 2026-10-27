import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import type { BrowseSidebarData } from '~/core/browse/fetch-browse-sidebar-data';
import { resolveMemberSpaceFromWalletSafe } from '~/core/browse/resolve-member-space-from-wallet';
import { WALLET_ADDRESS } from '~/core/cookie';
import { parseExploreTime } from '~/core/explore/explore-feed-params';
import { feedUnavailableResponse } from '~/core/explore/feed-route-response';
import { fetchExploreFeed } from '~/core/explore/fetch-explore-feed';

import { getGovernanceHomeSpaceContext } from '~/app/home/governance-home-space-ids';

/**
 * Activity feed for a single space. Reuses the explore fetcher but drops the type
 * whitelist and name filter — activity should surface any recently-edited entity in
 * the space, including Properties, Types, unnamed entities, etc.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const time = parseExploreTime(searchParams.get('time'));
  // `spaceIds` since the feed's filter became a multi-select; `spaceId` still accepted because this
  // route is pinned to exactly one space and that is the older, simpler thing to send.
  const spaceId = searchParams.get('spaceIds')?.split(',')[0] || searchParams.get('spaceId');
  const cursor = searchParams.get('cursor');

  if (!spaceId) {
    return NextResponse.json({ items: [], nextCursor: null });
  }

  const cookieWallet = (await cookies()).get(WALLET_ADDRESS)?.value;

  let personalMemberSpaceId: string | null = null;
  let memberOrEditorSpaceIds: string[] = [];

  if (cookieWallet) {
    personalMemberSpaceId = await resolveMemberSpaceFromWalletSafe(cookieWallet);
    if (personalMemberSpaceId) {
      try {
        const ctx = await getGovernanceHomeSpaceContext(personalMemberSpaceId);
        memberOrEditorSpaceIds = [...new Set([...ctx.editorIds, ...ctx.myProposalSpaceIds, personalMemberSpaceId])];
      } catch {
        memberOrEditorSpaceIds = [personalMemberSpaceId];
      }
    }
  }

  // Activity is pinned to a single space passed in from the URL, so we don't need the
  // real browse sidebar data to build the allowed-space set — synthesize a minimal one.
  const browse: BrowseSidebarData = {
    featured: [{ id: spaceId, name: '', image: null }],
    editorOf: [],
    memberOf: [],
    documentationImage: null,
    personalSpaceId: null,
  };

  try {
    const result = await fetchExploreFeed({
      browse,
      sort: 'new',
      time,
      spaceFilterIds: [spaceId],
      cursor,
      walletAddress: cookieWallet ?? null,
      memberOrEditorSpaceIds,
      // Activity: no type whitelist, but keep the name requirement so unnamed
      // entities (e.g. property system rows) don't clutter the feed.
      typeIds: undefined,
      requireName: true,
    });
    return NextResponse.json(result);
  } catch (e) {
    console.error('activity feed', e);
    return feedUnavailableResponse();
  }
}
