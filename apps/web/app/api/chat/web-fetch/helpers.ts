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
  // Strip surrounding brackets so `[::1]` and `::1` are treated identically.
  const bare = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
  if (bare === 'localhost' || bare.endsWith('.localhost')) return true;
  if (bare === '0.0.0.0') return true;
  if (/^10\./.test(bare)) return true;
  if (/^192\.168\./.test(bare)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(bare)) return true;
  if (/^127\./.test(bare)) return true;
  if (/^169\.254\./.test(bare)) return true;
  // IPv6 loopback / unspecified, including the unabbreviated form.
  if (bare === '::' || bare === '::1' || bare === '0:0:0:0:0:0:0:0' || bare === '0:0:0:0:0:0:0:1') return true;
  // Unique-local (fc00::/7) and link-local (fe80::/10).
  if (/^fc[0-9a-f]{2}:|^fd[0-9a-f]{2}:|^fe80:/i.test(bare)) return true;
  // IPv4-mapped IPv6 (::ffff:a.b.c.d / ::ffff:7f00:1) — re-check the embedded address.
  const mapped = bare.match(/^::ffff:([0-9a-f.:]+)$/i);
  if (mapped) {
    const inner = mapped[1];
    if (/^[0-9.]+$/.test(inner)) return isPrivateHost(inner);
    // Hex form (::ffff:7f00:1) — decode the last two groups to dotted-quad.
    const groups = inner.split(':');
    if (groups.length === 2) {
      const hi = parseInt(groups[0], 16);
      const lo = parseInt(groups[1], 16);
      if (Number.isFinite(hi) && Number.isFinite(lo)) {
        const dotted = `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
        return isPrivateHost(dotted);
      }
    }
  }
  // 6to4 (2002::/16) embeds the IPv4 address in the next 32 bits.
  const sixtofour = bare.match(/^2002:([0-9a-f]{1,4}):([0-9a-f]{1,4})/i);
  if (sixtofour) {
    const hi = parseInt(sixtofour[1], 16);
    const lo = parseInt(sixtofour[2], 16);
    if (Number.isFinite(hi) && Number.isFinite(lo)) {
      const dotted = `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
      if (isPrivateHost(dotted)) return true;
    }
  }
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
    // Handles are 1–15 chars, alphanumeric + underscore.
    const match = url.pathname.match(/^\/([A-Za-z0-9_]{1,15})\/status\/(\d+)(?:\/|$)/);
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

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  copy: '©',
  reg: '®',
  trade: '™',
};

// oEmbed's `html` field wraps tweet text in <blockquote><p>; strip tags to
// recover plain text. Single-pass entity decode so `&amp;lt;` correctly stays
// as the literal `&lt;` (the old chained-replace did `&lt;` → `<`).
export function stripHtml(html: string): string {
  const withBreaks = html.replace(/<br\s*\/?>/gi, '\n');
  const stripped = withBreaks.replace(/<[^>]*>/g, '');
  return stripped
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, body: string) => {
      if (body.startsWith('#x') || body.startsWith('#X')) {
        const code = Number.parseInt(body.slice(2), 16);
        return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : match;
      }
      if (body.startsWith('#')) {
        const code = Number.parseInt(body.slice(1), 10);
        return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : match;
      }
      return NAMED_ENTITIES[body.toLowerCase()] ?? match;
    })
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
