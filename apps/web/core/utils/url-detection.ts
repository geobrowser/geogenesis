// Matches scheme-qualified (http/https) or www-prefixed URLs only — never bare
// domains. Keep this in sync with the alternation used by the detector regexes
// below so detection, normalization, and rendering all agree on what a web2 URL is.
export const WEB2_URL_PREFIX_REGEX = /^(https?:\/\/|www\.)/i;

// One URL "body" character: anything except whitespace, the HTML/markdown
// delimiters we never want to swallow, and parentheses/brackets.
const WEB2_URL_CHAR = /[^\s<>"{}|\\^`[\]()]/.source;

// A single level of *balanced* parentheses, e.g. Wikipedia's "_(book)",
// "_(film)", "_(disambiguation)" convention. Without this, a URL like
// https://en.wikipedia.org/wiki/Spillover_(book) is truncated at the first "(",
// which — inside a markdown link — makes the detector miss the real link and
// emit a bogus bare URL instead. That mismatch is what corrupted the document
// and froze the tab on citation-dense imports. Nested parens are intentionally
// not supported; they effectively never occur in real URLs.
const WEB2_URL_PAREN_GROUP = `\\(${WEB2_URL_CHAR}*\\)`;

// A full URL: scheme (http/https or www.) followed by body chars, where any run
// may include one balanced-parentheses group. This is the single source of
// truth every detector regex below is built from.
const WEB2_URL_CORE = `(?:https?:\\/\\/|www\\.)(?:${WEB2_URL_CHAR}|${WEB2_URL_PAREN_GROUP})+`;

function web2UrlTokenRegex(): RegExp {
  return new RegExp(`(${WEB2_URL_CORE})`, 'gi');
}

function markdownLinkRegex(): RegExp {
  return new RegExp(`\\[([^\\]]+)\\]\\((${WEB2_URL_CORE})\\)`, 'gi');
}

// Extracts the label and (parenthesis-aware) URL from a single markdown link
// literal like `[label](https://en.wikipedia.org/wiki/Spillover_(book))`.
// Callers that need to reason about a detected markdown link should use this
// instead of an ad-hoc `/\[([^\]]+)\]\(([^)]+)\)/` — that pattern stops the URL
// at the first ")", dropping the closing paren of the destination.
export function parseMarkdownLink(text: string): { label: string; url: string } | null {
  const match = markdownLinkRegex().exec(text);
  if (!match) return null;
  return { label: match[1], url: match[2] };
}

export function isWeb2Url(url: string | null | undefined): url is string {
  return !!url?.trim() && WEB2_URL_PREFIX_REGEX.test(url.trim());
}

// Ensures a web2 URL has a scheme so it can be used as an href (www.x.com -> https://www.x.com).
export function normalizeWeb2Url(url: string): string {
  const trimmedUrl = url.trim();
  return /^https?:\/\//i.test(trimmedUrl) ? trimmedUrl : `https://${trimmedUrl}`;
}

// Splits a plain-text string into alternating plain and web2-URL segments so a
// renderer can wrap the URL segments as links. Matches the same URL shapes as
// detectWeb2URLs (http/https/www only).
export function tokenizeWeb2Urls(text: string): Array<{ type: 'text' | 'url'; value: string }> {
  const segments: Array<{ type: 'text' | 'url'; value: string }> = [];
  const regex = web2UrlTokenRegex();
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', value: text.slice(lastIndex, match.index) });
    }
    segments.push({ type: 'url', value: match[0] });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    segments.push({ type: 'text', value: text.slice(lastIndex) });
  }
  return segments;
}

export function detectWeb2URLs(text: string): string[] {
  if (!text || typeof text !== 'string') {
    return [];
  }

  // Check if text is already inside an anchor tag with web2-url-highlight class
  const anchorWithClassRegex = /<a[^>]*class=['"][^'"]*web2-url-highlight[^'"]*['"][^>]*>.*?<\/a>/gi;
  if (anchorWithClassRegex.test(text)) {
    return [];
  }

  const results: string[] = [];

  // Detect standalone URLs only
  const urlRegex = web2UrlTokenRegex();
  let urlMatch;

  while ((urlMatch = urlRegex.exec(text)) !== null) {
    const url = urlMatch[0];
    results.push(url);
  }

  return results;
}

export function detectWeb2URLsInMarkdown(text: string): string[] {
  if (!text || typeof text !== 'string') return [];

  // Only scheme-qualified (http/https) or www-prefixed URLs are treated as links.
  // Bare domains (e.g. "example.com") are intentionally not detected to avoid
  // linkifying filenames and prose like "package.json" or "index.ts".
  if (!text.includes('[') && !text.includes('http') && !text.includes('www.')) {
    return [];
  }

  const anchorWithClassRegex = /<a[^>]*class=['"][^'"]*web2-url-highlight[^'"]*['"][^>]*>.*?<\/a>/gi;
  if (anchorWithClassRegex.test(text)) return [];

  const results: string[] = [];
  const processedRanges: Array<{ start: number; end: number }> = [];

  const markdownLink = markdownLinkRegex();
  let markdownMatch;
  while ((markdownMatch = markdownLink.exec(text)) !== null) {
    results.push(markdownMatch[0]);
    processedRanges.push({ start: markdownMatch.index, end: markdownMatch.index + markdownMatch[0].length });
  }

  const urlRegex = web2UrlTokenRegex();
  let urlMatch;
  while ((urlMatch = urlRegex.exec(text)) !== null) {
    const url = urlMatch[0];
    const urlStart = urlMatch.index;
    const urlEnd = urlMatch.index + url.length;

    const isWithinMarkdownLink = processedRanges.some(r => urlStart >= r.start && urlEnd <= r.end);
    if (!isWithinMarkdownLink) {
      results.push(url);
    }
  }

  return results;
}
