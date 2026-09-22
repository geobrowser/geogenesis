import { IdUtils } from '@geoprotocol/geo-sdk/lite';

import { NextResponse } from 'next/server';

import { type ExploreSort, fetchExploreFeed } from '~/core/explore/fetch-explore-feed';
import { topicFeedFilter } from '~/core/topics/browse/topic-feed-filter';
import { resolveTopicFeedRequestContext } from '~/core/topics/browse/topic-feed-request-context';
import { parseTopicFeedTypeIds } from '~/core/topics/browse/topic-feed-types';

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
  const { browse, memberOrEditorSpaceIds, walletAddress } = await resolveTopicFeedRequestContext(routeSpaceId);

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
