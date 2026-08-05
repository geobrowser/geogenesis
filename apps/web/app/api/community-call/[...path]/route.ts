/**
 * Pass-through proxy to the curator-backend community-call API.
 *
 * Browser → curator-backend is cross-origin; this same-origin route forwards the
 * method, body, and Authorization header verbatim and returns the response
 * untouched. CORS workaround only — zero logic, zero secrets. The Privy identity
 * token in the Authorization header is the user's own; the LiveKit token is minted
 * by curator-backend and returned through here unchanged.
 *
 * CURATOR_BACKEND_URL (server-only) must be set in every environment, to the same
 * shared curator-backend deploy — local dev and prod need to hit the same backend/DB
 * so data created in one environment (e.g. a recording) is visible in the others. No
 * default/fallback: an unset var fails loudly instead of silently drifting between
 * environments.
 */

// Hop-by-hop headers must not be forwarded (RFC 7230 §6.1) plus content-length /
// host which the runtime recomputes for the upstream request/response. Cookies are
// also stripped both ways — the curator backend doesn't need geogenesis session
// cookies, and shouldn't be able to set cookies on the geogenesis domain.
const STRIPPED_REQUEST_HEADERS = new Set(['host', 'connection', 'content-length', 'cookie']);
const STRIPPED_RESPONSE_HEADERS = new Set([
  'content-encoding',
  'content-length',
  'transfer-encoding',
  'connection',
  'set-cookie',
]);

async function proxy(req: Request, path: string[]): Promise<Response> {
  const base = process.env.CURATOR_BACKEND_URL;
  if (!base) {
    throw new Error('CURATOR_BACKEND_URL must be set');
  }

  const { search } = new URL(req.url);
  const target = `${base.replace(/\/$/, '')}/${path.map(encodeURIComponent).join('/')}${search}`;

  const headers = new Headers();
  req.headers.forEach((value, key) => {
    if (!STRIPPED_REQUEST_HEADERS.has(key.toLowerCase())) headers.set(key, value);
  });

  const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
  const upstream = await fetch(target, {
    method: req.method,
    headers,
    body: hasBody ? await req.arrayBuffer() : undefined,
    redirect: 'manual',
  });

  const responseHeaders = new Headers();
  upstream.headers.forEach((value, key) => {
    if (!STRIPPED_RESPONSE_HEADERS.has(key.toLowerCase())) responseHeaders.set(key, value);
  });

  return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
}

type Ctx = { params: Promise<{ path: string[] }> };

const handler = async (req: Request, ctx: Ctx) => proxy(req, (await ctx.params).path);

export { handler as GET, handler as POST, handler as PUT, handler as PATCH, handler as DELETE };
