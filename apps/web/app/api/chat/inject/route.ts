// POST /api/chat/inject — submits a URL to the external inject pipeline.
// We proxy here so the bearer token stays server-side.
import { cookies } from 'next/headers';

import type { InjectType } from '~/core/chat/inject-types';
import { WALLET_ADDRESS } from '~/core/cookie';

import { ipCeilingLimit, loggedInLimit } from '../rate-limit';

const INJECT_SPACE = 'world-affairs' as const;
const VALID_TYPES: ReadonlySet<InjectType> = new Set(['news-story-single', 'post', 'tweet']);
const INJECT_FETCH_TIMEOUT_MS = 15_000;

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

function injectBase(): string | null {
  const raw = process.env.INJECT_BASE?.trim();
  if (!raw) return null;
  return raw.replace(/\/$/, '');
}

async function postToInject(path: string, body: unknown, apiKey: string) {
  const base = injectBase();
  if (!base) throw new Error('INJECT_BASE not configured');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), INJECT_FETCH_TIMEOUT_MS);
  try {
    return await fetch(`${base}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function POST(req: Request) {
  if (!isSameOrigin(req)) {
    return jsonError(403, 'Forbidden');
  }

  const cookieStore = await cookies();
  const wallet = parseWalletCookie(cookieStore.get(WALLET_ADDRESS)?.value);
  if (!wallet) {
    return jsonError(401, 'Sign in to use inject.');
  }

  const ip = getClientIp(req);
  try {
    const [identity, ipCeiling] = await Promise.all([loggedInLimit.limit(wallet), ipCeilingLimit.limit(ip)]);
    if (!identity.success || !ipCeiling.success) {
      const reset = Math.max(identity.success ? 0 : identity.reset, ipCeiling.success ? 0 : ipCeiling.reset);
      return rateLimitResponse(reset);
    }
  } catch (err) {
    console.error('[chat/inject] rate limiter unavailable; failing closed', err);
    return jsonError(503, 'Service temporarily unavailable.');
  }

  let url: string;
  let type: InjectType;
  try {
    const body = await req.json();
    if (typeof body?.url !== 'string') return jsonError(400, 'Invalid url');
    if (typeof body?.type !== 'string' || !VALID_TYPES.has(body.type as InjectType)) {
      return jsonError(400, 'Invalid type');
    }
    url = body.url.trim();
    type = body.type as InjectType;
    if (!url) return jsonError(400, 'Empty url');
  } catch {
    return jsonError(400, 'Invalid request body');
  }

  const apiKey = process.env.INJECT_API_KEY?.trim();
  if (!apiKey) {
    console.error('[chat/inject] INJECT_API_KEY not configured');
    return jsonError(503, 'Inject service not configured.');
  }
  if (!injectBase()) {
    console.error('[chat/inject] INJECT_BASE not configured');
    return jsonError(503, 'Inject service not configured.');
  }

  const payload = { space: INJECT_SPACE, url, type };

  let res: Response;
  try {
    res = await postToInject('/inject', payload, apiKey);
  } catch (err) {
    console.error('[chat/inject] proxy fetch failed', err);
    if (err instanceof Error && err.name === 'AbortError') {
      return jsonError(504, 'Inject service timed out.');
    }
    return jsonError(502, 'Inject service unreachable.');
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.error('[chat/inject] inject submit non-OK', res.status, text);
    return jsonError(502, `Inject service returned ${res.status}.`);
  }

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    return jsonError(502, 'Inject service returned non-JSON.');
  }

  const jobId = (data as { jobId?: unknown }).jobId;
  if (jobId === undefined || jobId === null) {
    console.error('[chat/inject] inject submit response missing jobId', data);
    return jsonError(502, 'Inject service response missing jobId.');
  }

  return new Response(JSON.stringify({ jobId: String(jobId) }), {
    status: 202,
    headers: { 'Content-Type': 'application/json' },
  });
}
