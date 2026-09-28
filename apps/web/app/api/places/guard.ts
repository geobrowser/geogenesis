import { getClientIp } from '../client-ip';
import { isSameOrigin } from '../same-origin';
import { placesIpLimit } from './rate-limit';

/**
 * The checks both Mapbox proxies run before spending a request.
 *
 * Returns a `Response` to send back, or `null` to carry on.
 */
export async function guardPlacesRequest(request: Request): Promise<Response | null> {
  if (!isSameOrigin(request)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const { success, reset } = await placesIpLimit.limit(getClientIp(request));
    if (!success) {
      const retryAfter = Math.max(1, Math.ceil((reset - Date.now()) / 1000));
      return Response.json({ error: 'Rate limit exceeded.' }, { status: 429, headers: { 'Retry-After': String(retryAfter) } });
    }
  } catch (error) {
    // Refused in production whether the credentials are missing or Redis is briefly unreachable,
    // matching `newsletter/subscribe`. An unlimited version of a metered, anonymous, billable
    // endpoint is not a thing to serve while we work out which of the two it is. Outside
    // production there is no Redis to speak of and no bill to run up, so it carries on.
    if (process.env.NODE_ENV === 'production') {
      console.error('places: rate limiter unavailable, refusing', error);
      return Response.json({ error: 'Rate limit unavailable.' }, { status: 503 });
    }
  }

  return null;
}

/**
 * A Mapbox session token, or null.
 *
 * Mapbox's own tokens are UUIDs; anything else is a caller improvising. Validated rather than
 * escaped because this lands in an upstream query string, and the set of things that belong there
 * is small and knowable.
 */
export function validSessionToken(raw: string | null): string | null {
  if (!raw) return null;
  return /^[0-9a-fA-F-]{8,64}$/.test(raw) ? raw : null;
}
