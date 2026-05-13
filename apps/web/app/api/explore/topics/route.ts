import { NextResponse } from 'next/server';

import { fetchRootTopics } from '~/core/io/subgraph/fetch-root-topics';

const UUID_PATTERN = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawSpaceId = searchParams.get('spaceId');

  // Validate against a UUID pattern so we don't pass arbitrary input into the
  // subgraph query string. Empty / missing returns the global set.
  const spaceId = rawSpaceId && UUID_PATTERN.test(rawSpaceId) ? rawSpaceId : undefined;

  try {
    const result = await fetchRootTopics({ spaceId });
    return NextResponse.json(result, {
      // Mirrors the 30s client-side staleTime in claim-a-topic-section.tsx.
      // SWR window keeps the panel responsive across short bounces while the
      // CDN re-fetches in the background.
      headers: {
        'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=300',
      },
    });
  } catch (e) {
    console.error('explore topics', e);
    /** Degraded response so the side panel still renders when the subgraph is down. */
    return NextResponse.json({ unclaimed: [], recentlyClaimed: [] });
  }
}
