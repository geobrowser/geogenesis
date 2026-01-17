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
  if (!text || typeof text !== 'string') {
    return [];
  }

  // Early exit if no potential markdown links or web2 URLs
  if (!text.includes('[') && !text.includes('http')) {
    return [];
  }

  // Check if text is already inside an anchor tag with web2-url-highlight class
  const anchorWithClassRegex = /<a[^>]*class=['"][^'"]*web2-url-highlight[^'"]*['"][^>]*>.*?<\/a>/gi;
  if (anchorWithClassRegex.test(text)) {
    return [];
  }

  const results: string[] = [];

  // First, detect markdown links with web2 URLs
  const markdownLinkRegex = /\[([^\]]+)\]\((https?:\/\/[^\s<>"{}|\\^`[\]()]+|www\.[^\s<>"{}|\\^`[\]()]+)\)/gi;
  const processedRanges: Array<{ start: number; end: number }> = [];
  let markdownMatch;

  while ((markdownMatch = markdownLinkRegex.exec(text)) !== null) {
    results.push(markdownMatch[0]); // Full markdown link
    processedRanges.push({
      start: markdownMatch.index,
      end: markdownMatch.index + markdownMatch[0].length,
    });
  }

  // Then detect standalone URLs that aren't already part of markdown links
  const urlRegex = /(https?:\/\/[^\s<>"{}|\\^`[\]()]+|www\.[^\s<>"{}|\\^`[\]()]+)/gi;
  let urlMatch;

  while ((urlMatch = urlRegex.exec(text)) !== null) {
    const url = urlMatch[0];
    const urlStart = urlMatch.index;
    const urlEnd = urlMatch.index + url.length;

    // Check if this URL is within any processed markdown link range
    const isWithinMarkdownLink = processedRanges.some(range => 
      urlStart >= range.start && urlEnd <= range.end
    );

    if (!isWithinMarkdownLink) {
      results.push(url);
    }
  }

  return results;
}
