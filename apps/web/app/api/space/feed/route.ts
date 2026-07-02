import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import type { BrowseSidebarData } from '~/core/browse/fetch-browse-sidebar-data';
import { resolveMemberSpaceFromWalletSafe } from '~/core/browse/resolve-member-space-from-wallet';
import { WALLET_ADDRESS } from '~/core/cookie';
import { type ExploreSort, type ExploreTime, fetchExploreFeed } from '~/core/explore/fetch-explore-feed';

import { getGovernanceHomeSpaceContext } from '~/app/home/governance-home-space-ids';

const SORTS: ExploreSort[] = ['new', 'top'];
const TIMES: ExploreTime[] = ['today', 'week', 'month', 'year', 'all'];

function parseSort(raw: string | null): ExploreSort {
  if (raw && (SORTS as string[]).includes(raw)) return raw as ExploreSort;
  return 'new';
}

function parseTime(raw: string | null): ExploreTime {
  if (raw && (TIMES as string[]).includes(raw)) return raw as ExploreTime;
  return 'week';
}

/**
 * Generic type-scoped feed for a single space. Reuses the explore fetcher pinned to one
 * space (via a synthesized single-space browse, so it works for spaces the viewer is not a
 * member of) and restricted to the requested entity types. Powers the space-home content
 * sections (News stories, and later debates / claims) — each section passes its own `types`.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sort = parseSort(searchParams.get('sort'));
  const time = parseTime(searchParams.get('time'));
  const spaceId = searchParams.get('spaceId');
  const cursor = searchParams.get('cursor');

  const parsedTypes = (searchParams.get('types') ?? '')
    .split(',')
    .map(t => t.trim())
    .filter(Boolean);
  const typeIds = parsedTypes.length > 0 ? parsedTypes : undefined;

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

  // Pinned to a single space passed in from the URL, so we don't need the real browse
  // sidebar data to build the allowed-space set — synthesize a minimal one. This also lets
  // the feed work for spaces the viewer is not a member of (a space home must render for
  // anyone), unlike the explore route which matches against the viewer's own browse spaces.
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
      sort,
      time,
      spaceFilterId: spaceId,
      cursor,
      walletAddress: cookieWallet ?? null,
      memberOrEditorSpaceIds,
      typeIds,
      requireName: true,
    });
    return NextResponse.json(result);
  } catch (e) {
    console.error('space feed', e);
    /** Degraded response so the space home still mounts when GraphQL is down; client shows empty feed. */
    return NextResponse.json({ items: [], nextCursor: null });
  }
}
