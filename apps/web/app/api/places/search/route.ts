import { NextResponse } from 'next/server';

import { Feature } from '~/core/hooks/use-place-search';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('query');
  const sessionToken = searchParams.get('sessionToken');

  if (!query) {
    return NextResponse.json({ error: 'Query parameter is required' }, { status: 400 });
  }

  try {
    const mapboxRes = await fetch(
      `https://api.mapbox.com/search/searchbox/v1/suggest?q=${encodeURIComponent(
        query
      )}&access_token=${process.env.MAPBOX_TOKEN}&session_token=${sessionToken}`
    );

    const data = await mapboxRes.json();

    const mapBoxData: Feature[] = data.suggestions.map(
      (suggestion: { name: any; full_address: string; mapbox_id: string }) => {
        return {
          place_name: suggestion?.name,
          mapbox_id: suggestion?.mapbox_id,
          text: suggestion?.full_address,
        };
      }
    );

    return NextResponse.json({ suggestions: mapBoxData });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Failed to fetch address data' }, { status: 500 });
  }
}
