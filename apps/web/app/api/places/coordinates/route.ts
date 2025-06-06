import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionToken = searchParams.get('sessionToken');
    const mapboxId = searchParams.get('mapboxId');

    const response = await fetch(
      `https://api.mapbox.com/search/searchbox/v1/retrieve/${mapboxId}?session_token=${sessionToken}&access_token=${process.env.MAPBOX_TOKEN}`
    );

    const data = await response.json();
    const feature = data?.features?.[0];

    if (!feature || !feature.geometry?.coordinates) {
      return NextResponse.json(null);
    }

    const [longitude, latitude] = feature.geometry.coordinates;

    return NextResponse.json({ latitude, longitude });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 });
  }
}
