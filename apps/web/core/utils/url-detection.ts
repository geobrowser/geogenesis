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

  const BARE_DOMAIN_RE = /\b\w+\.[a-z]{2,}/i;
  if (!text.includes('[') && !text.includes('http') && !BARE_DOMAIN_RE.test(text)) {
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

  const urlRegex =
    /(https?:\/\/[^\s<>"{}|\\^`[\]()]+|www\.[^\s<>"{}|\\^`[\]()]+|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}(?:\/[^\s<>"{}|\\^`[\]()]*)?)/gi;
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
