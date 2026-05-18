export const MAX_URL_CHARS = 2_000;
export const MAX_SUMMARY_CHARS = 4_000;

export type Source = { url: string; title: string | null };
export type ParsedUrl = {
  url: URL;
  isXPost: boolean;
  xPath: { user: string; statusId: string } | null;
};

// Defense-in-depth SSRF block — neither FxTwitter nor Anthropic's webFetch uses
// the user-supplied URL for a server-side fetch today, but any future direct
// fetch path must not be steered at loopback / RFC1918 / link-local hosts.
export function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost')) return true;
  if (host === '0.0.0.0' || host === '::' || host === '[::]') return true;
  if (host === '::1' || host === '[::1]') return true;
  if (/^10\./.test(host)) return true;
  if (/^192\.168\./.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true;
  if (/^127\./.test(host)) return true;
  if (/^169\.254\./.test(host)) return true;
  if (/^fc[0-9a-f]{2}:|^fd[0-9a-f]{2}:|^fe80:/i.test(host)) return true;
  return false;
}

const X_HOSTS = new Set(['x.com', 'twitter.com', 'mobile.twitter.com', 'www.x.com', 'www.twitter.com']);

export function validateUrl(input: unknown): ParsedUrl | null {
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

  const host = url.hostname.toLowerCase();
  if (X_HOSTS.has(host)) {
    // Path shape: /<user>/status/<id>(/...)? — fxtwitter needs both parts.
    const match = url.pathname.match(/^\/([^/]+)\/status\/(\d+)(?:\/|$)/i);
    if (match) {
      return { url, isXPost: true, xPath: { user: match[1], statusId: match[2] } };
    }
    // x.com URL that isn't a single-post status (profile, search, list, etc.)
    // — fxtwitter can't help, and Anthropic webFetch can't render JS. Treat
    // as unfetchable so the model surfaces that to the user instead of hanging.
    return { url, isXPost: true, xPath: null };
  }
  return { url, isXPost: false, xPath: null };
}

export function clampSummary(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= MAX_SUMMARY_CHARS) return trimmed;
  return `${trimmed.slice(0, MAX_SUMMARY_CHARS - 1).trimEnd()}…`;
}

// oEmbed's `html` field wraps tweet text in <blockquote><p>; strip tags to
// recover plain text.
export function stripHtml(html: string): string {
  const withBreaks = html.replace(/<br\s*\/?>/gi, '\n');
  const stripped = withBreaks.replace(/<[^>]*>/g, '');
  return stripped
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// FxTwitter — returns clean JSON. Docs: https://github.com/FixTweet/FxTwitter
export type FxTweetMedia = { type?: unknown; url?: unknown };
export type FxTweet = {
  id?: unknown;
  url?: unknown;
  text?: unknown;
  created_at?: unknown;
  author?: { name?: unknown; screen_name?: unknown };
  media?: { photos?: FxTweetMedia[]; videos?: FxTweetMedia[] };
  quote?: { text?: unknown; author?: { name?: unknown; screen_name?: unknown } };
  replying_to?: unknown;
};

export function summarizeFxTweet(tweet: FxTweet, originalUrl: string): { summary: string; sources: Source[] } | null {
  const text = typeof tweet.text === 'string' ? tweet.text.trim() : '';
  if (!text) return null;
  const authorName = typeof tweet.author?.name === 'string' ? tweet.author.name : null;
  const screenName = typeof tweet.author?.screen_name === 'string' ? tweet.author.screen_name : null;
  const createdAt = typeof tweet.created_at === 'string' ? tweet.created_at : null;
  const tweetUrl = typeof tweet.url === 'string' ? tweet.url : originalUrl;

  const lines: string[] = [];
  const handle = screenName ? `@${screenName}` : null;
  const who = authorName && handle ? `${authorName} (${handle})` : (authorName ?? handle ?? 'Unknown author');
  const when = createdAt ? ` on ${createdAt}` : '';
  lines.push(`Post by ${who}${when}:`);
  lines.push('');
  lines.push(text);

  const photos = tweet.media?.photos ?? [];
  const videos = tweet.media?.videos ?? [];
  if (photos.length || videos.length) {
    const parts: string[] = [];
    if (photos.length) parts.push(`${photos.length} image${photos.length > 1 ? 's' : ''}`);
    if (videos.length) parts.push(`${videos.length} video${videos.length > 1 ? 's' : ''}`);
    lines.push('');
    lines.push(`Attached: ${parts.join(', ')}.`);
  }

  const quote = tweet.quote;
  if (quote && typeof quote.text === 'string' && quote.text.trim().length > 0) {
    const qAuthor = typeof quote.author?.name === 'string' ? quote.author.name : null;
    const qHandle = typeof quote.author?.screen_name === 'string' ? `@${quote.author.screen_name}` : null;
    const qWho = qAuthor && qHandle ? `${qAuthor} (${qHandle})` : (qAuthor ?? qHandle ?? 'another user');
    lines.push('');
    lines.push(`Quotes ${qWho}: "${quote.text.trim()}"`);
  }

  return {
    summary: clampSummary(lines.join('\n')),
    sources: [{ url: tweetUrl, title: handle ? `${handle} on X` : 'X post' }],
  };
}
