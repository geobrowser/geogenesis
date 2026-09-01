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

const EMPTY_BROWSE: BrowseSidebarData = {
  featured: [],
  editorOf: [],
  memberOf: [],
  documentationImage: null,
  personalSpaceId: null,
};

/** The viewer's own spaces, degrading to just their personal space if governance is down. */
async function resolveMemberOrEditorSpaceIds(personalMemberSpaceId: string | null): Promise<string[]> {
  if (!personalMemberSpaceId) return [];
  try {
    const ctx = await getGovernanceHomeSpaceContext(personalMemberSpaceId);
    return [...new Set([...ctx.editorIds, ...ctx.myProposalSpaceIds, personalMemberSpaceId])];
  } catch {
    return [personalMemberSpaceId];
  }
}

/** Sidebar data, retried signed-out before giving up, so one bad member lookup isn't fatal. */
async function resolveBrowseSidebarData(personalMemberSpaceId: string | null): Promise<BrowseSidebarData> {
  try {
    return await fetchBrowseSidebarData(personalMemberSpaceId);
  } catch {
    try {
      return await fetchBrowseSidebarData(null);
    } catch {
      return EMPTY_BROWSE;
    }
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sort = parseSort(searchParams.get('sort'));
  const time = parseTime(searchParams.get('time'));
  const spaceId = searchParams.get('spaceId');
  const cursor = searchParams.get('cursor');
  const typeIds = parseExploreTypeIdsParam(searchParams.get('typeIds'));

  if (typeIds.length === 0) {
    return NextResponse.json({ items: [], nextCursor: null });
  }

  const cookieWallet = (await cookies()).get(WALLET_ADDRESS)?.value;

  const personalMemberSpaceId = cookieWallet ? await resolveMemberSpaceFromWalletSafe(cookieWallet) : null;

  // Concurrent, because neither consumes the other's output: both need only
  // `personalMemberSpaceId`, and `memberOrEditorSpaceIds` is handed to `fetchExploreFeed`
  // separately from the sidebar data. Awaiting them one after the other spent a round trip
  // on nothing. (They do overlap in what they ask for — both want the viewer's editor and
  // member spaces — but that is deduped by the request-level memos on `fetchEditorSpaceIds`
  // and `fetchMemberSpaces` rather than by ordering.)
  const [memberOrEditorSpaceIds, browse] = await Promise.all([
    resolveMemberOrEditorSpaceIds(personalMemberSpaceId),
    resolveBrowseSidebarData(personalMemberSpaceId),
  ]);

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
      personalMemberSpaceId,
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
