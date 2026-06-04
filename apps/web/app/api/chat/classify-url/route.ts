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
import { UTILITY_MODEL } from '../models';
import { ipCeilingLimit, loggedInLimit } from '../rate-limit';

const anthropic = createAnthropic({
  apiKey: process.env.CLAUDE_API_KEY,
});

const MAX_URL_CHARS = 2_048;

// Mostly registrable domains; `matchesNewsHost` matches each entry and its
// subdomains by suffix, so don't add www/english/amp/edition variants. A few
// entries are intentionally specific subdomains (e.g. news.sky.com,
// abcnews.go.com, timesofindia.indiatimes.com) to avoid matching an outlet's
// unrelated non-news subdomains.
const NEWS_HOSTS: ReadonlySet<string> = new Set([
  // US national / general
  'nytimes.com',
  'washingtonpost.com',
  'usatoday.com',
  'latimes.com',
  'chicagotribune.com',
  'bostonglobe.com',
  'sfgate.com',
  'nypost.com',
  'newsday.com',
  'startribune.com',
  'dallasnews.com',
  'seattletimes.com',
  'denverpost.com',
  'azcentral.com',
  'tampabay.com',
  // US broadcast / cable
  'cnn.com',
  'foxnews.com',
  'nbcnews.com',
  'abcnews.go.com',
  'cbsnews.com',
  'msnbc.com',
  'npr.org',
  'pbs.org',
  'newsnationnow.com',
  'cnbc.com',
  // US digital-native / magazine
  'axios.com',
  'politico.com',
  'thehill.com',
  'vox.com',
  'slate.com',
  'salon.com',
  'huffpost.com',
  'buzzfeednews.com',
  'businessinsider.com',
  'theatlantic.com',
  'newyorker.com',
  'time.com',
  'newsweek.com',
  'vanityfair.com',
  'theintercept.com',
  'motherjones.com',
  'propublica.org',
  'thedailybeast.com',
  'semafor.com',
  'mediaite.com',
  // Wire services
  'apnews.com',
  'reuters.com',
  'afp.com',
  'upi.com',
  // Business / finance
  'wsj.com',
  'bloomberg.com',
  'ft.com',
  'economist.com',
  'forbes.com',
  'fortune.com',
  'marketwatch.com',
  'barrons.com',
  'fastcompany.com',
  'inc.com',
  // Tech / science
  'wired.com',
  'theverge.com',
  'techcrunch.com',
  'arstechnica.com',
  'engadget.com',
  'gizmodo.com',
  'cnet.com',
  'mashable.com',
  'venturebeat.com',
  'scientificamerican.com',
  'nationalgeographic.com',
  // UK
  'bbc.com',
  'bbc.co.uk',
  'theguardian.com',
  'telegraph.co.uk',
  'thetimes.co.uk',
  'independent.co.uk',
  'dailymail.co.uk',
  'mirror.co.uk',
  'thesun.co.uk',
  'standard.co.uk',
  'metro.co.uk',
  'express.co.uk',
  'news.sky.com',
  // International / global English
  'aljazeera.com',
  'aljazeera.net',
  'dw.com',
  'france24.com',
  'rfi.fr',
  'euronews.com',
  'politico.eu',
  'thelocal.com',
  'rt.com',
  'cgtn.com',
  'scmp.com',
  'japantimes.co.jp',
  'asahi.com',
  'straitstimes.com',
  'channelnewsasia.com',
  'thehindu.com',
  'timesofindia.indiatimes.com',
  'indianexpress.com',
  'ndtv.com',
  'hindustantimes.com',
  'haaretz.com',
  'timesofisrael.com',
  'jpost.com',
  'middleeasteye.net',
  'globeandmail.com',
  'cbc.ca',
  'ctvnews.ca',
  'abc.net.au',
  'smh.com.au',
  'theage.com.au',
  'news.com.au',
  'nzherald.co.nz',
  'irishtimes.com',
  'spiegel.de',
  'lemonde.fr',
  'elpais.com',
  'corriere.it',
]);

function matchesNewsHost(host: string): boolean {
  for (const domain of NEWS_HOSTS) {
    if (host === domain || host.endsWith(`.${domain}`)) return true;
  }
  return false;
}

const BLOG_HOSTS = new Set(['substack.com', 'medium.com', 'mirror.xyz', 'paragraph.xyz', 'ghost.io']);

function matchesBlogHost(host: string): boolean {
  for (const domain of BLOG_HOSTS) {
    if (host === domain || host.endsWith(`.${domain}`)) return true;
  }
  return false;
}

const HOSTNAME_RULES: Array<{ match: (host: string, pathname: string) => boolean; type: InjectType }> = [
  { match: host => host === 'x.com' || host === 'twitter.com' || host === 'mobile.twitter.com', type: 'tweet' },
  {
    match: host =>
      host === 'reddit.com' || host === 'www.reddit.com' || host === 'old.reddit.com' || host === 'redd.it',
    type: 'post',
  },
  // Blog platforms → Post (editorial, not news). Placed before the news-host
  // check so a blog never gets mistaken for a news article.
  { match: host => matchesBlogHost(host), type: 'post' },
  // Specific company blogs (host + blog path → Post). Path-scoped on purpose
  // so docs.* subdomains and product/landing pages are NOT routed to post —
  // only the editorial blog/research sections are. NOTE: /news is deliberately
  // excluded here — a company's /news section is a newsroom, routed to News
  // Story by the general /news rule below.
  {
    match: (host, path) =>
      (host === 'anthropic.com' || host === 'www.anthropic.com') && /^\/(engineering|research)(\/|$)/.test(path),
    type: 'post',
  },
  // OpenAI editorial sections (/index, /blog, /research) → Post. The newsroom
  // landing at openai.com/news still routes to News Story via the general
  // /news rule below.
  {
    match: (host, path) =>
      (host === 'openai.com' || host === 'www.openai.com') && /^\/(index|blog|research)(\/|$)/.test(path),
    type: 'post',
  },
  // Any company's own /news section → News Story. A /news path is a newsroom /
  // press section, so it's a news source even when the domain isn't a dedicated
  // news outlet (covers anthropic.com/news, openai.com/news, and any company).
  // Runs AFTER the blog-platform rule above, so Substack/Medium/etc. stay Post.
  { match: (_host, path) => /^\/news(\/|$)/.test(path), type: 'news-story-single' },
  // Wikipedia → Post: the article IS the content (an encyclopedic entry), not a
  // news event to seed sibling-source discovery from.
  { match: host => host.endsWith('.wikipedia.org') || host === 'wikipedia.org', type: 'post' },
  { match: host => host === 'linkedin.com' || host === 'www.linkedin.com', type: 'news-story-single' },
  { match: host => matchesNewsHost(host), type: 'news-story-single' },
];

const CLASSIFIER_SYSTEM_PROMPT = `You are routing a URL to one of two pipelines for a knowledge-graph app.

Return route="inject" when the URL points to:
- A news article, current event, breaking story, exposé, or evolving topic from any publication.
- A blog post, company or engineering blog, personal essay, or newsletter post (e.g. Substack, Medium, Mirror, Ghost, or a company's /blog).
- A Wikipedia article (any kind — topic, person, organization, event).
- A LinkedIn profile or personal/portfolio site.
- A social post (X / Twitter / Reddit) you would expect to discuss a current happening.

Return route="chat" ONLY when the URL clearly points to:
- Static documentation, manuals, or developer/API references.
- Marketing or product/landing pages and product listings.
- Encyclopedic definitions of static concepts with no time-sensitive component.

When route="inject", also pick the most appropriate type:
- "news-story-single" — a journalistic news article or current-events story from a news publication, OR a LinkedIn / personal profile.
- "post" — a blog post, company/engineering blog, personal essay, newsletter/Substack/Medium/Mirror post, OR a Wikipedia article: editorial or encyclopedic web content that is NOT from a journalistic news outlet. (Reddit URLs are also "post".)
- "tweet" — X / Twitter URL.

Decide "news-story-single" vs "post" by the SOURCE, not the topic: a news organization reporting an event → "news-story-single"; an individual's or a company's OWN blog/essay/newsletter → "post".

Bias toward route="inject": if the URL plausibly looks like a news article, blog post, current event, biography, or social post, choose inject. Only choose chat when the page is clearly static/reference/marketing content. When genuinely unsure between the two inject types, prefer "news-story-single". Never invent a URL or visit it; decide from the URL itself.`;

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
      model: anthropic(UTILITY_MODEL),
      system: CLASSIFIER_SYSTEM_PROMPT,
      prompt: `URL: ${rawUrl}`,
      schema,
      maxOutputTokens: 200,
    });
    logCallCost('classify-url', UTILITY_MODEL, result.usage);

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
