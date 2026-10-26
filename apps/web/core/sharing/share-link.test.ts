import { describe, expect, it } from 'vitest';

import { createShareLink, parseShareLink } from './share-link';

const target = '4C81561D-1F95-4131-9CDD-DD20AB831BA2';
const shareId = '22222222-2222-4222-8222-222222222222';

describe('share URLs', () => {
  it('round trips normalized attribution while preserving a booking target and fragment', () => {
    const link = createShareLink(
      `https://geobrowser.io/space/${target}?modal=availability&via=share#week`,
      'availability',
      target,
      'copy_link',
      shareId
    );
    const url = new URL(link.url);
    expect(url.searchParams.get('modal')).toBe('availability');
    expect(url.searchParams.get('via')).toBe('share');
    expect(url.hash).toBe('#week');
    expect(parseShareLink(url.searchParams)).toEqual(link.attribution);
    expect(link.attribution?.share_content_id).toBe('4c81561d1f9541319cdddd20ab831ba2');
    expect(url.searchParams.get('utm_content')).toBe(
      'v1:availability:4c81561d1f9541319cdddd20ab831ba2:22222222222242228222222222222222'
    );
    expect([...url.searchParams.keys()]).toEqual([
      'modal',
      'via',
      'utm_source',
      'utm_medium',
      'utm_campaign',
      'utm_content',
    ]);
  });

  it('replaces a previous sender/campaign and preserves lobby semantics', () => {
    const link = createShareLink(
      `https://geobrowser.io/debate/${target}?via=lobby&utm_term=old-sharer&utm_source=old&utm_content=old&link_id=old&fbclid=old`,
      'lobby',
      target,
      'reddit',
      shareId
    );
    const params = new URL(link.url).searchParams;
    expect(params.get('via')).toBe('lobby');
    expect(params.get('utm_source')).toBe('reddit');
    expect(params.has('utm_term')).toBe(false);
    expect(params.has('link_id')).toBe(false);
    expect(params.has('fbclid')).toBe(false);
    expect(link.url).not.toContain('old-sharer');
  });

  it('generates a new share for each action and leaves invalid product targets usable', () => {
    const url = 'https://geobrowser.io/debate/example';
    expect(createShareLink(url, 'debate', target, 'x').attribution?.share_id).not.toBe(
      createShareLink(url, 'debate', target, 'x').attribution?.share_id
    );
    expect(createShareLink(url, 'debate', 'invalid', 'x')).toEqual({ url, attribution: null });
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
    const params = new URL(createShareLink('https://geobrowser.io/explore', 'debate', target, 'x', shareId).url)
      .searchParams;
    for (const [key, value] of Object.entries(override)) params.set(key, value);
    expect(parseShareLink(params)).toBeNull();
  });
});
