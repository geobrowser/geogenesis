/**
 * Pass-through proxy to the curator-backend community-call API.
 *
 * Browser → curator-backend is cross-origin; this same-origin route forwards the
 * method, body, and Authorization header verbatim and returns the response
 * untouched. CORS workaround only — zero logic, zero secrets. The Privy identity
 * token in the Authorization header is the user's own; the LiveKit token is minted
 * by curator-backend and returned through here unchanged.
 *
 * Defaults to the staging curator-backend in dev; set CURATOR_BACKEND_URL (server-only)
 * to point at another deploy. Required in production — the route throws rather than
 * silently falling back to staging.
 */

const DEFAULT_CURATOR_BACKEND_URL = 'https://curator-api-staging-testnet.up.railway.app';

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
  if (process.env.NODE_ENV === 'production' && !process.env.CURATOR_BACKEND_URL) {
    throw new Error('CURATOR_BACKEND_URL must be set in production');
  }
  const base = process.env.CURATOR_BACKEND_URL || DEFAULT_CURATOR_BACKEND_URL;

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
