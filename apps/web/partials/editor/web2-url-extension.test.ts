import { describe, expect, it } from 'vitest';

import {
  getWeb2Replacement,
  isStandaloneWeb2Text,
  isWeb2Url,
  normalizeWeb2Url,
  stripInternalWeb2HTMLAttributes,
} from './web2-url-extension';

describe('web2-url-extension helpers', () => {
  it('detects supported web2 URLs only', () => {
    expect(isWeb2Url('https://example.com')).toBe(true);
    expect(isWeb2Url('www.example.com')).toBe(true);
    expect(isWeb2Url('graph://entity')).toBe(false);
    expect(isWeb2Url('mailto:test@example.com')).toBe(false);
  });

  it('normalizes scheme-less web2 URLs', () => {
    expect(normalizeWeb2Url('www.example.com/path')).toBe('https://www.example.com/path');
    expect(normalizeWeb2Url('https://example.com/path')).toBe('https://example.com/path');
  });

  it('recognizes standalone URL text against the stored URL', () => {
    expect(isStandaloneWeb2Text('www.example.com/path', 'https://www.example.com/path')).toBe(true);
    expect(isStandaloneWeb2Text('https://www.example.com/path', 'www.example.com/path')).toBe(true);
    expect(isStandaloneWeb2Text('See all albums', 'www.example.com/path')).toBe(false);
  });

  it('converts parsed markdown links back to markdown in edit mode', () => {
    expect(getWeb2Replacement('See all albums', 'www.rhcp.com/albums', true)).toEqual({
      text: '[See all albums](www.rhcp.com/albums)',
      url: 'www.rhcp.com/albums',
      editMode: true,
    });
  });

  it('keeps rendered label text in browse mode', () => {
    expect(getWeb2Replacement('See all albums', 'www.rhcp.com/albums', false)).toEqual({
      text: 'See all albums',
      url: 'www.rhcp.com/albums',
      editMode: false,
    });
  });

  it('strips internal mark attrs from rendered HTML attributes', () => {
    expect(
      stripInternalWeb2HTMLAttributes({
        url: 'https://example.com',
        editMode: true,
        class: 'existing-class',
        'data-url': 'https://example.com',
      })
    ).toEqual({
      class: 'existing-class',
      'data-url': 'https://example.com',
    });
  });
});
