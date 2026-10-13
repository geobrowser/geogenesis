import { NextResponse } from 'next/server';

import { parseExplorePageSort, parseExploreTime } from '~/core/explore/explore-feed-params';
import { parseExploreTypeIdsParam } from '~/core/explore/explore-type-filter';
import { feedUnavailableResponse } from '~/core/explore/feed-route-response';
import { resolveForYouViewer } from '~/core/explore/for-you/resolve-for-you-viewer';
import { serveExploreFeedPage } from '~/core/explore/serve-explore-feed-page';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const typeIds = parseExploreTypeIdsParam(searchParams.get('typeIds'));

  if (typeIds.length === 0) {
    return NextResponse.json({ items: [], nextCursor: null });
  }

  const page = await serveExploreFeedPage(
    {
      pageSort: parseExplorePageSort(searchParams.get('sort')),
      time: parseExploreTime(searchParams.get('time')),
      // A list since GEO-2789's explore half. `spaceId` is still read so an older client, or a link
      // someone kept, still narrows to the one space it names.
      spaceIdsParam: searchParams.get('spaceIds') ?? searchParams.get('spaceId'),
      cursor: searchParams.get('cursor'),
      typeIds,
      followedTopicIdsParam: searchParams.get('followedTopicIds'),
    },
    context => resolveForYouViewer(request, context)
  );
  if (!page) return feedUnavailableResponse();

  // A personalized page belongs to one person: never let any cache between here and them keep it.
  return NextResponse.json(
    page.body,
    page.personalized ? { headers: { 'cache-control': 'private, no-store' } } : undefined
  );
}
