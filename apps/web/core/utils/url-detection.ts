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

  // Check if text is already inside an anchor tag with web2-url-highlight class
  const anchorWithClassRegex = /<a[^>]*class=['"][^'"]*web2-url-highlight[^'"]*['"][^>]*>.*?<\/a>/gi;
  if (anchorWithClassRegex.test(text)) {
    return [];
  }

  const results: string[] = [];

  // First, detect markdown links with web2 URLs and collect the URLs from them
  const markdownLinkRegex = /\[([^\]]+)\]\((https?:\/\/[^\s<>"{}|\\^`[\]()]+|www\.[^\s<>"{}|\\^`[\]()]+)\)/gi;
  const usedUrls = new Set<string>();
  let markdownMatch;

  while ((markdownMatch = markdownLinkRegex.exec(text)) !== null) {
    results.push(markdownMatch[0]); // Full markdown link
    usedUrls.add(markdownMatch[2]); // The URL part
  }

  // Then detect standalone URLs that aren't already part of markdown links
  const urlRegex = /(https?:\/\/[^\s<>"{}|\\^`[\]()]+|www\.[^\s<>"{}|\\^`[\]()]+)/gi;
  let urlMatch;

  while ((urlMatch = urlRegex.exec(text)) !== null) {
    const url = urlMatch[0];
    if (!usedUrls.has(url)) {
      results.push(url);
    }
  }

  return results;
}
