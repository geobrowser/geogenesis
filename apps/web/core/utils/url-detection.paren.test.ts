import { describe, expect, it } from 'vitest';

import { detectWeb2URLs, detectWeb2URLsInMarkdown, parseMarkdownLink, tokenizeWeb2Urls } from './url-detection';

// Regression coverage for URLs that contain a balanced pair of parentheses —
// the Wikipedia "_(book)", "_(film)", "_(disambiguation)" convention. Before the
// fix, the detector truncated these at the first "(", which made a markdown link
// with such a URL go undetected and emitted a bogus bare URL in its place. That
// mismatch is what corrupted the editor document and froze the browser tab.
const PAREN_URL = 'https://en.wikipedia.org/wiki/Spillover_(book)';
const PAREN_LINK = `[spillovers](${PAREN_URL})`;

describe('url-detection — parenthesis-aware URLs', () => {
  it('parseMarkdownLink keeps the closing paren of the destination', () => {
    expect(parseMarkdownLink(PAREN_LINK)).toEqual({ label: 'spillovers', url: PAREN_URL });
  });

  it('parseMarkdownLink still handles plain URLs', () => {
    expect(parseMarkdownLink('[docs](https://example.com/a)')).toEqual({
      label: 'docs',
      url: 'https://example.com/a',
    });
  });

  it('parseMarkdownLink returns null for non-links', () => {
    expect(parseMarkdownLink('just some text')).toBeNull();
  });

  it('detects a paren-URL markdown link as one link, not a truncated bare URL', () => {
    const text = `Zoonotic ${PAREN_LINK} have occurred throughout history.`;
    const detected = detectWeb2URLsInMarkdown(text);
    // Exactly the full markdown literal, and NOT a separate truncated URL entry.
    expect(detected).toEqual([PAREN_LINK]);
    expect(detected.some(d => d === 'https://en.wikipedia.org/wiki/Spillover_')).toBe(false);
  });

  it('tokenizes a standalone paren-URL as a single whole URL', () => {
    const segments = tokenizeWeb2Urls(`See ${PAREN_URL} here`);
    const urls = segments.filter(s => s.type === 'url').map(s => s.value);
    expect(urls).toEqual([PAREN_URL]);
  });

  it('detects a standalone paren-URL fully', () => {
    expect(detectWeb2URLs(`See ${PAREN_URL} here`)).toEqual([PAREN_URL]);
  });

  it('does not swallow a following prose paren as part of the URL', () => {
    // "(see https://example.com)" — the closing ) belongs to the prose, not the URL.
    const segments = tokenizeWeb2Urls('(see https://example.com)');
    const urls = segments.filter(s => s.type === 'url').map(s => s.value);
    expect(urls).toEqual(['https://example.com']);
  });
});
