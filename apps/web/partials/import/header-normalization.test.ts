import { describe, expect, it } from 'vitest';

import { normalizeHeader, normalizeHeaderForMatch } from './header-normalization';

describe('header normalization', () => {
  it('normalizes spacing and casing', () => {
    expect(normalizeHeader('  Related   Projects ')).toBe('related projects');
  });

  it('maps known high-confidence misspellings', () => {
    expect(normalizeHeaderForMatch('Desciption')).toBe('description');
    expect(normalizeHeaderForMatch('imagecover')).toBe('image cover');
  });
});
