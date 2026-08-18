import { describe, expect, it } from 'vitest';

import { normalizeHttpUrl } from './normalize-http-url';

describe('normalizeHttpUrl', () => {
  it('returns null for empty input', () => {
    expect(normalizeHttpUrl('')).toBeNull();
    expect(normalizeHttpUrl('   ')).toBeNull();
  });

  it('defaults bare domains to https', () => {
    expect(normalizeHttpUrl('example.com/article')).toBe('https://example.com/article');
  });

  it('preserves http and https schemes', () => {
    expect(normalizeHttpUrl('http://example.com')).toBe('http://example.com/');
    expect(normalizeHttpUrl('https://example.com/path')).toBe('https://example.com/path');
  });

  it('rejects non-http schemes', () => {
    expect(normalizeHttpUrl('ftp://example.com')).toBeNull();
    expect(normalizeHttpUrl('file:///tmp/x')).toBeNull();
  });
});
