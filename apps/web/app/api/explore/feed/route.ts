import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

import { getGovernanceHomeSpaceContext } from '~/app/home/governance-home-space-ids';
import type { BrowseSidebarData } from '~/core/browse/fetch-browse-sidebar-data';
import { fetchBrowseSidebarData } from '~/core/browse/fetch-browse-sidebar-data';
import {
  resolveMemberSpaceFromWalletSafe,
} from '~/core/browse/resolve-member-space-from-wallet';
import { WALLET_ADDRESS } from '~/core/cookie';
import {
  type ExploreSort,
  type ExploreTime,
  fetchExploreFeed,
} from '~/core/explore/fetch-explore-feed';

function normId(id: string): string {
  return id.replace(/-/g, '').toLowerCase();
}

const SORTS: ExploreSort[] = ['new', 'top', 'controversial'];
const TIMES: ExploreTime[] = ['today', 'week', 'month', 'year', 'all'];

function parseSort(raw: string | null): ExploreSort {
  if (raw && (SORTS as string[]).includes(raw)) return raw as ExploreSort;
  return 'top';
}

function parseTime(raw: string | null): ExploreTime {
  if (raw && (TIMES as string[]).includes(raw)) return raw as ExploreTime;
  return 'week';
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sort = parseSort(searchParams.get('sort'));
  const time = parseTime(searchParams.get('time'));
  const spaceId = searchParams.get('spaceId');
  const cursor = searchParams.get('cursor');

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

  let browse: BrowseSidebarData;
  try {
    browse = await fetchBrowseSidebarData(personalMemberSpaceId);
  } catch {
    try {
      browse = await fetchBrowseSidebarData(null);
    } catch {
      browse = {
        featured: [],
        editorOf: [],
        memberOf: [],
        documentationImage: null,
        personalSpaceId: null,
      };
    }
  }

  let spaceFilter: string | null = null;
  if (spaceId && spaceId !== 'all') {
    const want = normId(spaceId);
    const match = [...browse.featured, ...browse.editorOf, ...browse.memberOf].find(r => normId(r.id) === want);
    if (match) spaceFilter = match.id;
  }

  try {
    const result = await fetchExploreFeed({
      browse,
      sort,
      time,
      spaceFilterId: spaceFilter,
      cursor,
      walletAddress: cookieWallet ?? null,
      memberOrEditorSpaceIds,
    });
    return NextResponse.json(result);
  } catch (e) {
    console.error('explore feed', e);
    /** Degraded response so the Explore UI still mounts when GraphQL is down; client shows empty feed. */
    return NextResponse.json({ items: [], nextCursor: null });
  }
}
