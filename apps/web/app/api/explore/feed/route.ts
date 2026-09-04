import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import type { BrowseSidebarData } from '~/core/browse/fetch-browse-sidebar-data';
import { fetchBrowseSidebarData } from '~/core/browse/fetch-browse-sidebar-data';
import { resolveMemberSpaceFromWalletSafe } from '~/core/browse/resolve-member-space-from-wallet';
import { WALLET_ADDRESS } from '~/core/cookie';
import { parseExploreTypeIdsParam } from '~/core/explore/explore-type-filter';
import { type ExploreSort, type ExploreTime, fetchExploreFeed } from '~/core/explore/fetch-explore-feed';

import { getGovernanceHomeSpaceContext } from '~/app/home/governance-home-space-ids';

function normId(id: string): string {
  return id.replace(/-/g, '').toLowerCase();
}

const SORTS: ExploreSort[] = ['new', 'top', 'best'];
const TIMES: ExploreTime[] = ['today', 'week', 'month', 'year', 'all'];

function parseSort(raw: string | null): ExploreSort {
  if (raw && (SORTS as string[]).includes(raw)) return raw as ExploreSort;
  return 'best';
}

/**
 * No `time` parameter means no time filter, which is what `'all'` is — `timeThresholdSec` maps it
 * to null and nothing reaches the query. Feeds whose sort carries no range (Best, New) send
 * nothing rather than a window the viewer can neither see nor change; defaulting to a week here
 * would reinstate exactly the filter they omitted. An unrecognised value takes the same route: a
 * range nobody can name is not one to guess at.
 */
function parseTime(raw: string | null): ExploreTime {
  if (raw && (TIMES as string[]).includes(raw)) return raw as ExploreTime;
  return 'all';
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sort = parseSort(searchParams.get('sort'));
  const time = parseTime(searchParams.get('time'));
  // A list since GEO-2789's explore half. `spaceId` is still read so an older client, or a link
  // someone kept, still narrows to the one space it names.
  const spaceIdsParam = searchParams.get('spaceIds') ?? searchParams.get('spaceId');
  const cursor = searchParams.get('cursor');
  const typeIds = parseExploreTypeIdsParam(searchParams.get('typeIds'));

  if (typeIds.length === 0) {
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

  // Only spaces this reader may see, whatever they asked for. `all` and an empty parameter both
  // mean no narrowing; so does a list that matches nothing they can see, because a filter naming
  // only spaces they cannot see is a request we have no honest way to answer and an empty feed is
  // the wrong answer to it.
  let spaceFilter: string[] | null = null;
  if (spaceIdsParam && spaceIdsParam !== 'all') {
    const wanted = new Set(spaceIdsParam.split(',').map(normId).filter(Boolean));
    const visible = [...browse.featured, ...browse.editorOf, ...browse.memberOf]
      .filter(row => wanted.has(normId(row.id)))
      .map(row => row.id);
    if (visible.length > 0) spaceFilter = visible;
  }

  try {
    const result = await fetchExploreFeed({
      browse,
      sort,
      time,
      spaceFilterIds: spaceFilter,
      cursor,
      walletAddress: cookieWallet ?? null,
      memberOrEditorSpaceIds,
      typeIds,
      requireName: true,
    });
    return NextResponse.json(result);
  } catch (e) {
    console.error('explore feed', e);
    /** Degraded response so the Explore UI still mounts when GraphQL is down; client shows empty feed. */
    return NextResponse.json({ items: [], nextCursor: null });
  }
}
