/**
 * Pass-through proxy to rapporteur's transcript API — a separate service from
 * curator-backend, so it can't reuse the `[...path]` catch-all (which targets
 * CURATOR_BACKEND_URL). Same CORS-workaround shape: forward the Authorization
 * header verbatim, return the response untouched.
 *
 * Defaults to the staging rapporteur deploy in dev; set RAPPORTEUR_BACKEND_URL
 * (server-only) to point at another deploy. Required in production — the route
 * throws rather than silently falling back to staging.
 */

const DEFAULT_RAPPORTEUR_BACKEND_URL = 'https://rapporteur-staging-testnet.up.railway.app';

const STRIPPED_REQUEST_HEADERS = new Set(['host', 'connection', 'content-length', 'cookie']);
const STRIPPED_RESPONSE_HEADERS = new Set([
  'content-encoding',
  'content-length',
  'transfer-encoding',
  'connection',
  'set-cookie',
]);

type Ctx = { params: Promise<{ spaceId: string; callId: string; occurrenceStart: string }> };

export async function GET(req: Request, ctx: Ctx) {
  if (process.env.NODE_ENV === 'production' && !process.env.RAPPORTEUR_BACKEND_URL) {
    throw new Error('RAPPORTEUR_BACKEND_URL must be set in production');
  }
  const base = process.env.RAPPORTEUR_BACKEND_URL || DEFAULT_RAPPORTEUR_BACKEND_URL;

  const { spaceId, callId, occurrenceStart } = await ctx.params;
  const target = `${base.replace(/\/$/, '')}/transcripts/${encodeURIComponent(spaceId)}/${encodeURIComponent(callId)}/${encodeURIComponent(occurrenceStart)}`;

  const headers = new Headers();
  req.headers.forEach((value, key) => {
    if (!STRIPPED_REQUEST_HEADERS.has(key.toLowerCase())) headers.set(key, value);
  });

  const upstream = await fetch(target, { method: 'GET', headers, redirect: 'manual' });

  const responseHeaders = new Headers();
  upstream.headers.forEach((value, key) => {
    if (!STRIPPED_RESPONSE_HEADERS.has(key.toLowerCase())) responseHeaders.set(key, value);
  });

  return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
}
