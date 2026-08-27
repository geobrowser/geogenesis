// POST /api/chat/proxy-image — members-only image proxy for `setEntityImage`.
// Direct browser fetch is CORS-blocked on most public image hosts; this route
// fetches server-side with a real User-Agent and streams the bytes back.
import { cookies } from 'next/headers';

import { WALLET_ADDRESS } from '~/core/cookie';

import { ipCeilingLimit, loggedInLimit } from '../rate-limit';
import { SsrfBlockedError, isPrivateHost, safeFetch } from '../web-fetch/helpers';

const MAX_URL_CHARS = 2_000;
const MAX_BYTES = 8 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 10_000;
const PROXY_USER_AGENT = 'Mozilla/5.0 (compatible; GeoAssistantImageProxy/1.0; +https://geobrowser.io)';

function isSameOrigin(req: Request): boolean {
  const origin = req.headers.get('origin');
  const host = req.headers.get('host');
  if (!origin) return process.env.NODE_ENV !== 'production';
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

function parseWalletCookie(raw: string | undefined): string | null {
  if (!raw) return null;
  const lower = raw.toLowerCase();
  return /^0x[0-9a-f]{40}$/.test(lower) ? lower : null;
}

function getClientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  const real = req.headers.get('x-real-ip');
  if (real) return real;
  return `noip:${crypto.randomUUID()}`;
}

function jsonError(status: number, message: string, extraHeaders?: Record<string, string>) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  });
}

function rateLimitResponse(reset: number) {
  const retryAfter = Math.max(1, Math.ceil((reset - Date.now()) / 1000));
  return jsonError(429, 'Rate limit exceeded.', { 'Retry-After': retryAfter.toString() });
}

function validateImageUrl(input: unknown): URL | null {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_URL_CHARS) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (isPrivateHost(url.hostname)) return null;
  return url;
}

export async function POST(req: Request) {
  if (!isSameOrigin(req)) {
    return jsonError(403, 'Forbidden');
  }

  const cookieStore = await cookies();
  const wallet = parseWalletCookie(cookieStore.get(WALLET_ADDRESS)?.value);
  if (!wallet) {
    return jsonError(401, 'Sign in to proxy images.');
  }
  const ip = getClientIp(req);

  try {
    const [identity, ipCeiling] = await Promise.all([loggedInLimit.limit(wallet), ipCeilingLimit.limit(ip)]);
    if (!identity.success || !ipCeiling.success) {
      const reset = Math.max(identity.success ? 0 : identity.reset, ipCeiling.success ? 0 : ipCeiling.reset);
      return rateLimitResponse(reset);
    }
  } catch (err) {
    console.error('[chat/proxy-image] rate limiter unavailable', err);
    if (process.env.NODE_ENV === 'production') {
      return jsonError(503, 'Service temporarily unavailable.');
    }
  }

  let url: URL;
  try {
    const body = await req.json();
    const validated = validateImageUrl(body?.url);
    if (!validated) return jsonError(400, 'Invalid URL');
    url = validated;
  } catch {
    return jsonError(400, 'Invalid body');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let upstream: Response;
  try {
    upstream = await safeFetch(url.toString(), {
      signal: controller.signal,
      headers: {
        'User-Agent': PROXY_USER_AGENT,
        Accept: 'image/*',
      },
    });
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof SsrfBlockedError) {
      return jsonError(400, 'Redirect target rejected');
    }
    console.error('[chat/proxy-image] upstream fetch failed', err);
    return jsonError(502, 'Upstream fetch failed');
  }
  clearTimeout(timer);

  if (!upstream.ok) {
    return jsonError(502, `Upstream returned ${upstream.status}`);
  }
  const contentType = (upstream.headers.get('content-type') ?? '').toLowerCase();
  if (!contentType.startsWith('image/')) {
    return jsonError(415, `Upstream did not return an image (got ${contentType || 'unknown'})`);
  }
  const lenHeader = upstream.headers.get('content-length');
  if (lenHeader) {
    const len = parseInt(lenHeader, 10);
    if (Number.isFinite(len) && len > MAX_BYTES) {
      return jsonError(413, `Image too large (${len} bytes; max ${MAX_BYTES})`);
    }
  }

  // Buffer so MAX_BYTES is enforced even when content-length is missing.
  let buf: ArrayBuffer;
  try {
    buf = await upstream.arrayBuffer();
  } catch (err) {
    console.error('[chat/proxy-image] body read failed', err);
    return jsonError(502, 'Upstream read failed');
  }
  if (buf.byteLength === 0) return jsonError(502, 'Upstream returned empty body');
  if (buf.byteLength > MAX_BYTES) return jsonError(413, `Image too large (${buf.byteLength} bytes; max ${MAX_BYTES})`);

  return new Response(buf, {
    status: 200,
    headers: {
      'Content-Type': contentType.split(';')[0].trim(),
      'Content-Length': buf.byteLength.toString(),
      'Cache-Control': 'private, max-age=300',
    },
  });
}
