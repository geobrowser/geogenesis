import { IdUtils } from '@geoprotocol/geo-sdk/lite';

import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import type { BrowseSidebarData } from '~/core/browse/fetch-browse-sidebar-data';
import { fetchBrowseSidebarData } from '~/core/browse/fetch-browse-sidebar-data';
import { resolveMemberSpaceFromWalletSafe } from '~/core/browse/resolve-member-space-from-wallet';
import { WALLET_ADDRESS } from '~/core/cookie';
import { type ExploreSort, fetchExploreFeed } from '~/core/explore/fetch-explore-feed';
import { topicFeedFilter } from '~/core/topics/browse/topic-feed-filter';
import { parseTopicFeedTypeIds } from '~/core/topics/browse/topic-feed-types';

import { getGovernanceHomeSpaceContext } from '~/app/home/governance-home-space-ids';

const SORTS: ExploreSort[] = ['new', 'top', 'best'];

function parseSort(raw: string | null): ExploreSort {
  return raw && (SORTS as string[]).includes(raw) ? (raw as ExploreSort) : 'best';
}

/** Mixed Topic rabbit-hole feed: direct topic entities plus Debates reached through their Claim. */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const topicId = searchParams.get('topicId');
  const routeSpaceId = searchParams.get('spaceId');
  if (!topicId || !IdUtils.isValid(topicId) || !routeSpaceId || !IdUtils.isValid(routeSpaceId)) {
    return NextResponse.json({ items: [], nextCursor: null }, { status: 400 });
  }

  const typeIds = parseTopicFeedTypeIds(searchParams.get('typeIds'));
  if (typeIds.length === 0) return NextResponse.json({ items: [], nextCursor: null });

  const selectedTopicIds = (searchParams.get('topicIds') ?? '')
    .split(',')
    .filter(IdUtils.isValid)
    .filter(id => id !== topicId);
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

  const visibleSpaceIds = new Set([...browse.featured, ...browse.editorOf, ...browse.memberOf].map(space => space.id));
  if (!visibleSpaceIds.has(routeSpaceId)) {
    browse = {
      ...browse,
      featured: [{ id: routeSpaceId, name: routeSpaceId.slice(0, 8), image: null }, ...browse.featured],
    };
  }

  try {
    const result = await fetchExploreFeed({
      browse,
      sort: parseSort(searchParams.get('sort')),
      time: 'all',
      spaceFilterIds: null,
      cursor: searchParams.get('cursor'),
      walletAddress,
      memberOrEditorSpaceIds,
      typeIds,
      requireName: true,
      entityFilter: topicFeedFilter(topicId, selectedTopicIds),
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error('topic feed', error);
    return NextResponse.json({ items: [], nextCursor: null }, { status: 500 });
  }
}
