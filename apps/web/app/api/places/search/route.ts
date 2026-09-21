import { NextResponse } from 'next/server';

import { Feature } from '~/core/hooks/use-place-search';

import { guardPlacesRequest, validSessionToken } from '../guard';

export async function GET(request: Request) {
  const blocked = await guardPlacesRequest(request);
  if (blocked) return blocked;

  const { searchParams } = new URL(request.url);
  const query = searchParams.get('query');
  const sessionToken = validSessionToken(searchParams.get('sessionToken'));

  if (!query) {
    return NextResponse.json({ error: 'Query parameter is required' }, { status: 400 });
  }

  if (!sessionToken) {
    return NextResponse.json({ error: 'A valid sessionToken is required' }, { status: 400 });
  }

  try {
    const url = new URL('https://api.mapbox.com/search/searchbox/v1/suggest');
    url.searchParams.set('q', query);
    url.searchParams.set('access_token', process.env.MAPBOX_TOKEN ?? '');
    url.searchParams.set('session_token', sessionToken);

    const mapboxRes = await fetch(url);
    const data = await mapboxRes.json();

    // Mapbox answers errors with a body that has no `suggestions`, and mapping straight off it
    // threw a TypeError that the catch below reported as a 500 — an upstream 4xx reading as our
    // fault. An empty list is the truthful answer to "what did it suggest".
    const suggestions: unknown = data?.suggestions;
    if (!Array.isArray(suggestions)) {
      if (!mapboxRes.ok) {
        console.error(`places search: Mapbox responded ${mapboxRes.status}`);
        return NextResponse.json({ error: 'Failed to fetch address data' }, { status: 502 });
      }
      return NextResponse.json({ suggestions: [] });
    }

    const mapBoxData: Feature[] = suggestions.map((suggestion: { name: any; full_address: string; mapbox_id: string }) => {
      return {
        place_name: suggestion?.name,
        mapbox_id: suggestion?.mapbox_id,
        text: suggestion?.full_address,
      };
    });

    return NextResponse.json({ suggestions: mapBoxData });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Failed to fetch address data' }, { status: 500 });
  }
}
