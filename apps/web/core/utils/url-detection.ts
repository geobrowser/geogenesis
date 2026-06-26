// Matches scheme-qualified (http/https) or www-prefixed URLs only — never bare
// domains. Keep this in sync with the alternation used by the detector regexes
// below so detection, normalization, and rendering all agree on what a web2 URL is.
export const WEB2_URL_PREFIX_REGEX = /^(https?:\/\/|www\.)/i;
const WEB2_URL_TOKEN_REGEX = /(https?:\/\/[^\s<>"{}|\\^`[\]()]+|www\.[^\s<>"{}|\\^`[\]()]+)/gi;

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
  const regex = new RegExp(WEB2_URL_TOKEN_REGEX.source, 'gi');
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
  const urlRegex = /(https?:\/\/[^\s<>"{}|\\^`[\]()]+|www\.[^\s<>"{}|\\^`[\]()]+)/gi;
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

  const markdownLinkRegex = /\[([^\]]+)\]\((https?:\/\/[^\s<>"{}|\\^`[\]()]+|www\.[^\s<>"{}|\\^`[\]()]+)\)/gi;
  let markdownMatch;
  while ((markdownMatch = markdownLinkRegex.exec(text)) !== null) {
    results.push(markdownMatch[0]);
    processedRanges.push({ start: markdownMatch.index, end: markdownMatch.index + markdownMatch[0].length });
  }

  const urlRegex = /(https?:\/\/[^\s<>"{}|\\^`[\]()]+|www\.[^\s<>"{}|\\^`[\]()]+)/gi;
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
