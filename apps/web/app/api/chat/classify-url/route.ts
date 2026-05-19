// POST /api/chat/classify-url — pre-routes URL imports. If the URL looks like
// a news article, current event, social post, or person profile, we steer
// the import through the dedicated `inject` pipeline instead of the generic
// chat-driven ingestion flow.
import { createAnthropic } from '@ai-sdk/anthropic';

import { generateObject, jsonSchema } from 'ai';
import { cookies } from 'next/headers';

import type { ClassifyUrlResponse, InjectType } from '~/core/chat/inject-types';
import { WALLET_ADDRESS } from '~/core/cookie';

import { logCallCost } from '../cost';
import { RESEARCH_MODEL } from '../models';
import { ipCeilingLimit, loggedInLimit } from '../rate-limit';

const anthropic = createAnthropic({
  apiKey: process.env.CLAUDE_API_KEY,
});

const MAX_URL_CHARS = 2_048;

const NEWS_HOSTS: ReadonlySet<string> = new Set([
  'nytimes.com',
  'www.nytimes.com',
  'bbc.com',
  'www.bbc.com',
  'bbc.co.uk',
  'www.bbc.co.uk',
  'theguardian.com',
  'www.theguardian.com',
  'apnews.com',
  'www.apnews.com',
  'reuters.com',
  'www.reuters.com',
  'washingtonpost.com',
  'www.washingtonpost.com',
  'wsj.com',
  'www.wsj.com',
  'bloomberg.com',
  'www.bloomberg.com',
  'axios.com',
  'www.axios.com',
  'politico.com',
  'www.politico.com',
  'npr.org',
  'www.npr.org',
  'ft.com',
  'www.ft.com',
  'aljazeera.com',
  'www.aljazeera.com',
  'cnn.com',
  'www.cnn.com',
  'economist.com',
  'www.economist.com',
  'theatlantic.com',
  'www.theatlantic.com',
  'newyorker.com',
  'www.newyorker.com',
]);

const HOSTNAME_RULES: Array<{ match: (host: string, pathname: string) => boolean; type: InjectType }> = [
  { match: host => host === 'x.com' || host === 'twitter.com' || host === 'mobile.twitter.com', type: 'tweet' },
  {
    match: host =>
      host === 'reddit.com' || host === 'www.reddit.com' || host === 'old.reddit.com' || host === 'redd.it',
    type: 'post',
  },
  { match: host => host.endsWith('.wikipedia.org') || host === 'wikipedia.org', type: 'news-story-single' },
  { match: host => host === 'linkedin.com' || host === 'www.linkedin.com', type: 'news-story-single' },
  { match: host => NEWS_HOSTS.has(host), type: 'news-story-single' },
];

const CLASSIFIER_SYSTEM_PROMPT = `You are routing a URL to one of two pipelines for a knowledge-graph app.

Return route="inject" when the URL points to:
- A news article, current event, breaking story, exposé, or evolving topic from any publication.
- A Wikipedia article (any kind — topic, person, organization, event).
- A LinkedIn profile or personal/portfolio site.
- A social post (X / Twitter / Reddit) you would expect to discuss a current happening.

Return route="chat" when the URL points to:
- Static documentation, marketing pages, product listings, generic blogs.
- Reference material with no time-sensitive component (developer docs, manuals, encyclopedic definitions of static concepts).
- Anything you can't confidently classify as a news story, biography, or social post.

When route="inject", also pick the most appropriate type:
- "news-story-single" — any news article, current event, Wikipedia article, LinkedIn profile, or personal/portfolio site.
- "tweet" — X / Twitter URL.
- "post" — Reddit URL.

If unsure, prefer route="chat". Never invent a URL or visit it; decide from the URL itself.`;

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

function jsonOk(body: ClassifyUrlResponse) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function normalizeHost(host: string): string {
  return host.toLowerCase();
}

function deterministicMatch(url: URL): InjectType | null {
  const host = normalizeHost(url.hostname);
  for (const rule of HOSTNAME_RULES) {
    if (rule.match(host, url.pathname)) return rule.type;
  }
  return null;
}

const schema = jsonSchema<{ route: 'chat' | 'inject'; type?: InjectType }>({
  type: 'object',
  properties: {
    route: { type: 'string', enum: ['chat', 'inject'] },
    type: {
      type: 'string',
      enum: ['news-story-single', 'tweet', 'post'],
      description: 'Required when route is "inject"; omit when route is "chat".',
    },
  },
  required: ['route'],
  additionalProperties: false,
});

export async function POST(req: Request) {
  if (!isSameOrigin(req)) {
    return jsonError(403, 'Forbidden');
  }

  const cookieStore = await cookies();
  const wallet = parseWalletCookie(cookieStore.get(WALLET_ADDRESS)?.value);
  if (!wallet) {
    return jsonError(401, 'Sign in to import URLs.');
  }

  let rawUrl: string;
  try {
    const body = await req.json();
    if (typeof body?.url !== 'string') return jsonError(400, 'Invalid url');
    rawUrl = body.url.trim();
    if (!rawUrl || rawUrl.length > MAX_URL_CHARS) return jsonError(400, 'Invalid url');
  } catch {
    return jsonError(400, 'Invalid request body');
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return jsonError(422, 'Unparseable url');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return jsonError(422, 'Only http(s) urls are supported');
  }

  const direct = deterministicMatch(parsed);
  if (direct !== null) {
    return jsonOk({ route: 'inject', type: direct });
  }

  // Only the LLM fallback below incurs model cost, so gate it (not the free
  // deterministic path above) behind the rate limiter.
  const ip = getClientIp(req);
  try {
    const [identity, ipCeiling] = await Promise.all([loggedInLimit.limit(wallet), ipCeilingLimit.limit(ip)]);
    if (!identity.success || !ipCeiling.success) {
      const reset = Math.max(identity.success ? 0 : identity.reset, ipCeiling.success ? 0 : ipCeiling.reset);
      return rateLimitResponse(reset);
    }
  } catch (err) {
    console.error('[chat/classify-url] rate limiter unavailable; failing closed', err);
    return jsonError(503, 'Service temporarily unavailable.');
  }

  try {
    const result = await generateObject({
      model: anthropic(RESEARCH_MODEL),
      system: CLASSIFIER_SYSTEM_PROMPT,
      prompt: `URL: ${rawUrl}`,
      schema,
      maxOutputTokens: 200,
    });
    logCallCost('classify-url', RESEARCH_MODEL, result.usage);

    const object = result.object;
    if (object.route === 'inject') {
      const type = object.type;
      if (type === 'news-story-single' || type === 'tweet' || type === 'post') {
        return jsonOk({ route: 'inject', type });
      }
      // Inject but no type → treat as chat to avoid a broken inject submit.
      return jsonOk({ route: 'chat' });
    }
    return jsonOk({ route: 'chat' });
  } catch (err) {
    console.error('[chat/classify-url] classification failed', err);
    // Failure-open: degrade to the existing chat-driven flow.
    return jsonOk({ route: 'chat' });
  }
}
