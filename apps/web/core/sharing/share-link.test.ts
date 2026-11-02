import { describe, expect, it } from 'vitest';

import { createShareLink, expandShareLink, parseShareLink } from './share-link';

const target = '4C81561D-1F95-4131-9CDD-DD20AB831BA2';
const space = 'c9f267dcb0d270718c2a3c45a64afd32';
const shareId = '22222222-2222-4222-8222-222222222222';

describe('share URLs', () => {
  it('copies a short code that expands to the tags the warehouse reads, keeping the destination', () => {
    const link = createShareLink(
      `https://geobrowser.io/space/${target}?modal=availability&via=share#week`,
      'availability',
      target,
      'copy_link',
      shareId
    );
    const url = new URL(link.url);
    expect([...url.searchParams.keys()]).toEqual(['modal', 'via', 'si']);
    expect(url.searchParams.get('si')).toBe('caIiIiIiIiQiKCIiIiIiIiIg');
    expect(url.hash).toBe('#week');
    expect(parseShareLink(url)).toEqual(link.attribution);
    expect(link.attribution?.share_content_id).toBe('4c81561d1f9541319cdddd20ab831ba2');

    const landing = new URL(expandShareLink(url)!);
    expect(landing.pathname).toBe(url.pathname);
    expect(landing.hash).toBe('#week');
    expect([...landing.searchParams.keys()]).toEqual([
      'modal',
      'via',
      'utm_source',
      'utm_medium',
      'utm_campaign',
      'utm_content',
    ]);
    expect(landing.searchParams.get('utm_source')).toBe('copy_link');
    expect(landing.searchParams.get('utm_content')).toBe(
      'v1:availability:4c81561d1f9541319cdddd20ab831ba2:22222222222242228222222222222222'
    );
    expect(parseShareLink(landing)).toEqual(link.attribution);
  });

  it('keeps a debate link well under half its old length', () => {
    const destination = `https://www.geobrowser.io/space/${space}/${target.replace(/-/g, '').toLowerCase()}`;
    const link = createShareLink(destination, 'debate', target, 'x', shareId);
    expect(link.url).toBe(`${destination}?si=xdIiIiIiIiQiKCIiIiIiIiIg`);
    expect(expandShareLink(link.url)!.length - link.url.length).toBeGreaterThan(100);
  });

  it.each([
    ['copy_link', 'lobby'],
    ['x', 'debate'],
    ['linkedin', 'availability'],
    ['reddit', 'debate'],
    ['native_share', 'lobby'],
  ] as const)('round trips %s / %s through the short code', (method, kind) => {
    const link = createShareLink(`https://geobrowser.io/debate/${target}`, kind, target, method);
    expect(parseShareLink(link.url)).toEqual(link.attribution);
    expect(parseShareLink(expandShareLink(link.url)!)).toEqual(link.attribution);
  });

  it('replaces a previous sender/campaign and preserves lobby semantics', () => {
    const link = createShareLink(
      `https://geobrowser.io/debate/${target}?via=lobby&si=old&utm_term=old-sharer&utm_source=old&utm_content=old&link_id=old&fbclid=old`,
      'lobby',
      target,
      'reddit',
      shareId
    );
    const url = new URL(link.url);
    expect([...url.searchParams.keys()]).toEqual(['via', 'si']);
    expect(link.url).not.toContain('old');
    expect(parseShareLink(url)?.method).toBe('reddit');
  });

  it('keeps the long tags when the destination does not end in the shared content', () => {
    const link = createShareLink('https://geobrowser.io/explore', 'debate', target, 'native_share', shareId);
    const params = new URL(link.url).searchParams;
    expect(params.has('si')).toBe(false);
    expect(params.get('utm_source')).toBe('native_share');
    expect(parseShareLink(link.url)).toEqual(link.attribution);
    expect(expandShareLink(link.url)).toBeNull();
  });

  it('still reads links shared in the long form', () => {
    const old = `https://geobrowser.io/debate/${target}?via=lobby&utm_source=x&utm_medium=share&utm_campaign=geo_share&utm_content=v1:lobby:4c81561d1f9541319cdddd20ab831ba2:22222222222242228222222222222222`;
    expect(parseShareLink(old)).toEqual({
      share_id: '22222222222242228222222222222222',
      share_content_type: 'lobby',
      share_content_id: '4c81561d1f9541319cdddd20ab831ba2',
      method: 'x',
    });
    expect(expandShareLink(old)).toBeNull();
  });

  it('generates a new share for each action and leaves invalid product targets usable', () => {
    const url = 'https://geobrowser.io/debate/example';
    expect(createShareLink(url, 'debate', target, 'x').attribution?.share_id).not.toBe(
      createShareLink(url, 'debate', target, 'x').attribution?.share_id
    );
    expect(createShareLink(url, 'debate', 'invalid', 'x')).toEqual({ url, attribution: null });
  });

  it.each([
    'zdIiIiIiIiQiKCIiIiIiIiIg',
    'xzIiIiIiIiQiKCIiIiIiIiIg',
    'xdIiIiIiIiQiIiIiIiIiIiI',
    'xdIiIiIiIiQiKCIiIiIiIiIgA',
    'xd!iIiIiIiQiKCIiIiIiIiIg',
    'xd',
  ])('ignores a malformed short code %s', code => {
    const url = `https://geobrowser.io/debate/${target}?si=${code}`;
    expect(parseShareLink(url)).toBeNull();
    expect(expandShareLink(url)).toBeNull();
  });

  it('ignores a short code on a path that does not end in an ID', () => {
    expect(expandShareLink('https://geobrowser.io/debate/example?si=xdIiIiIiIiQiKCIiIiIiIiIg')).toBeNull();
  });

  it.each([
    { utm_campaign: 'other' },
    { utm_medium: 'social' },
    { utm_source: 'invented' },
    { utm_content: `v2:debate:${target}:${shareId}` },
    { utm_content: `v1:claim:${target}:${shareId}` },
    { utm_content: `v1:debate:invalid:${shareId}` },
    { utm_content: `v1:debate:${target}:invalid` },
    { utm_content: `v1:debate:${target}:${shareId}:extra` },
    { utm_content: 'x'.repeat(501) },
  ])('ignores malformed or unrelated attribution %j', override => {
    const url = new URL(createShareLink('https://geobrowser.io/explore', 'debate', target, 'x', shareId).url);
    for (const [key, value] of Object.entries(override)) url.searchParams.set(key, value);
    expect(parseShareLink(url)).toBeNull();
  });
});
