import { describe, expect, it } from 'vitest';

import { detectWeb2URLs, detectWeb2URLsInMarkdown } from './url-detection';

describe('detectWeb2URLs', () => {
  it('should detect HTTP URLs', () => {
    const text = 'Visit http://example.com for more info';
    const result = detectWeb2URLs(text);
    expect(result).toEqual(['http://example.com']);
  });

  it('should detect HTTPS URLs', () => {
    const text = 'Check out https://secure.example.com';
    const result = detectWeb2URLs(text);
    expect(result).toEqual(['https://secure.example.com']);
  });

  it('should detect multiple URLs', () => {
    const text = 'Visit http://example.com and https://secure.example.com';
    const result = detectWeb2URLs(text);
    expect(result).toEqual(['http://example.com', 'https://secure.example.com']);
  });

  it('should return empty array for text without URLs', () => {
    const text = 'This is just plain text';
    const result = detectWeb2URLs(text);
    expect(result).toEqual([]);
  });

  it('should handle empty string', () => {
    const result = detectWeb2URLs('');
    expect(result).toEqual([]);
  });

  it('should handle null/undefined input', () => {
    expect(detectWeb2URLs(null as any)).toEqual([]);
    expect(detectWeb2URLs(undefined as any)).toEqual([]);
  });

  it('should not detect non-web2 protocols', () => {
    const text = 'Check ipfs://hash and ftp://server.com';
    const result = detectWeb2URLs(text);
    expect(result).toEqual([]);
  });

  it('should detect link with www.', () => {
    const text = 'Visit www.rhcp.com/albums';
    const result = detectWeb2URLs(text);
    expect(result).toEqual(['www.rhcp.com/albums']);
  });

  it('should handle URLs with paths and query params', () => {
    const text = 'Visit https://example.com/path?param=value&other=test';
    const result = detectWeb2URLs(text);
    expect(result).toEqual(['https://example.com/path?param=value&other=test']);
  });

  it('should handle URLs with ports', () => {
    const text = 'Local server at http://localhost:3000';
    const result = detectWeb2URLs(text);
    expect(result).toEqual(['http://localhost:3000']);
  });

  it('should detect www URLs in markdown links', () => {
    const text =
      'John Frusciante’s melodic guitar flourishes, and Chad Smith’s powerhouse drumming. [See all albums](www.rhcp.com/albums)';
    const result = detectWeb2URLs(text);
    expect(result).toEqual(['www.rhcp.com/albums']);
  });
});

describe('detectWeb2URLsInMarkdown', () => {
  it('should handle URLs with ports', () => {
    const text = 'Local server at http://localhost:3000';
    const result = detectWeb2URLsInMarkdown(text);
    expect(result).toEqual(['http://localhost:3000']);
  });

  it('should detect www URLs in markdown links', () => {
    const text =
      'John Frusciante`s melodic guitar flourishes, and Chad Smith`s powerhouse drumming. [See all albums](www.rhcp.com/albums)';
    const result = detectWeb2URLsInMarkdown(text);
    expect(result).toEqual(['[See all albums](www.rhcp.com/albums)']);
  });

  it('should not detect url inside anchor tag with class "web2-url-highlight"', () => {
    const text = `<a href='' class='web2-url-highlight'>[See all albums](www.rhcp.com/albums)</a>`;
    const result = detectWeb2URLsInMarkdown(text);
    expect(result).toEqual([]);
  });

  it('should detect standalone URLs without markdown format', () => {
    const text = 'Visit https://www.markdownguide.org/basic-syntax/#links for more info';
    const result = detectWeb2URLsInMarkdown(text);
    expect(result).toEqual(['https://www.markdownguide.org/basic-syntax/#links']);
  });

  it('should detect multiple standalone URLs', () => {
    const text = 'Check https://google.com and https://github.com for resources';
    const result = detectWeb2URLsInMarkdown(text);
    expect(result).toEqual(['https://google.com', 'https://github.com']);
  });

  it('should detect auto-generated markdown links', () => {
    const text = '[https://www.markdownguide.org/basic-syntax/#links](https://www.markdownguide.org/basic-syntax/#links)';
    const result = detectWeb2URLsInMarkdown(text);
    expect(result).toEqual(['[https://www.markdownguide.org/basic-syntax/#links](https://www.markdownguide.org/basic-syntax/#links)']);
  });
});
