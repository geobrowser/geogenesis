import { NextRequest, NextResponse } from 'next/server';

import { guardPlacesRequest, validSessionToken } from '../guard';

// Mapbox ids are opaque, but they land in the upstream *path*, so the shape is worth pinning
// rather than escaping: `dXJuOm1ieHBvaTo…`-style base64url plus the `.`/`:` separators it uses.
const MAPBOX_ID = /^[A-Za-z0-9_\-.:=]{1,256}$/;

export async function GET(request: NextRequest) {
  const blocked = await guardPlacesRequest(request);
  if (blocked) return blocked;

  try {
    const { searchParams } = new URL(request.url);
    const sessionToken = validSessionToken(searchParams.get('sessionToken'));
    const mapboxId = searchParams.get('mapboxId');

    // This used to be interpolated into the upstream path unescaped, so a caller could steer the
    // request off `/retrieve/` with `../` or append their own query with `?`. Its sibling route
    // encoded its user input; this one did not.
    if (!mapboxId || !MAPBOX_ID.test(mapboxId)) {
      return NextResponse.json({ error: 'A valid mapboxId is required' }, { status: 400 });
    }

    if (!sessionToken) {
      return NextResponse.json({ error: 'A valid sessionToken is required' }, { status: 400 });
    }

    const url = new URL(`https://api.mapbox.com/search/searchbox/v1/retrieve/${encodeURIComponent(mapboxId)}`);
    url.searchParams.set('session_token', sessionToken);
    url.searchParams.set('access_token', process.env.MAPBOX_TOKEN ?? '');

    const response = await fetch(url);
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
