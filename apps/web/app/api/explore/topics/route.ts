import { NextResponse } from 'next/server';

import { fetchUnclaimedSubtopics } from '~/core/io/subgraph/fetch-unclaimed-subtopics';

const UUID_PATTERN = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawParentId = searchParams.get('parentId');

  // Validate against a UUID pattern so we don't pass arbitrary input into the
  // subgraph query string. Missing / malformed is a 400 — the client should
  // only call this with a known parent topic id from the SSR-loaded options.
  if (!rawParentId || !UUID_PATTERN.test(rawParentId)) {
    return NextResponse.json({ topics: [] }, { status: 400 });
  }

  try {
    const topics = await fetchUnclaimedSubtopics(rawParentId);
    return NextResponse.json(
      { topics },
      {
        // Mirrors the 30s client-side staleTime in claim-a-topic-section.tsx.
        headers: {
          'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=300',
        },
      }
    );
  } catch (e) {
    console.error('explore subtopics', e);
    /** Degraded response so the panel still renders when the subgraph is down. */
    return NextResponse.json({ topics: [] });
  }
}
