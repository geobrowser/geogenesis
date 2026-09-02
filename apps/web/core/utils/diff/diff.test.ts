import { ContentIds, SystemIds } from '@geoprotocol/geo-sdk/lite';

import { describe, expect, it } from 'vitest';

import type { Entity } from '~/core/types';

import { resolveImageUrlFromEntity, resolveMediaUrlSide } from './diff';

// The same ids `diff.ts` matches on, straight from the SDK.
const IPFS_URL_PROPERTY = SystemIds.IMAGE_URL_PROPERTY;
const WEB_URL_PROPERTY = ContentIds.WEB_URL_PROPERTY;

const value = (propertyId: string, before: string | null, after: string | null) => ({
  propertyId,
  before,
  after,
});

describe('resolveMediaUrlSide', () => {
  // A proposal moving media off IPFS removes IPFS URL and adds Web URL in the same diff.
  it('shows the replacement when a proposal swaps IPFS URL for Web URL', () => {
    const values = [
      value(IPFS_URL_PROPERTY, 'ipfs://bafyold', null),
      value(WEB_URL_PROPERTY, null, 'https://chat.example/debates/1/media/artifacts/final_video/content'),
    ];

    expect(resolveMediaUrlSide(values, 'before')).toBe('ipfs://bafyold');
    expect(resolveMediaUrlSide(values, 'after')).toBe(
      'https://chat.example/debates/1/media/artifacts/final_video/content'
    );
  });

  it('prefers IPFS URL over Web URL on a side that has both', () => {
    const values = [
      value(IPFS_URL_PROPERTY, 'ipfs://bafybefore', 'ipfs://bafyafter'),
      value(WEB_URL_PROPERTY, 'https://chat.example/before', 'https://chat.example/after'),
    ];

    expect(resolveMediaUrlSide(values, 'before')).toBe('ipfs://bafybefore');
    expect(resolveMediaUrlSide(values, 'after')).toBe('ipfs://bafyafter');
  });

  // Debate media published after the move off IPFS only ever carries Web URL.
  it('falls back to Web URL when there is no IPFS URL at all', () => {
    const values = [value(WEB_URL_PROPERTY, null, 'https://chat.example/after')];

    expect(resolveMediaUrlSide(values, 'before')).toBeNull();
    expect(resolveMediaUrlSide(values, 'after')).toBe('https://chat.example/after');
  });

  // `Web URL` is a general link property, so only loadable media schemes count.
  it('ignores a Web URL value that is not a loadable media URL', () => {
    const values = [value(WEB_URL_PROPERTY, null, 'mailto:someone@example.com')];

    expect(resolveMediaUrlSide(values, 'after')).toBeNull();
  });

  // Image entities also carry width/height values.
  it('ignores unrelated properties and reports no URL when none is present', () => {
    const values = [value('width', '1080', '1080'), value('height', '1640', '1640')];

    expect(resolveMediaUrlSide(values, 'before')).toBeNull();
    expect(resolveMediaUrlSide(values, 'after')).toBeNull();
  });

  // Legacy media blocks store the URI on an unlabelled value, matched by scheme.
  it('finds an ipfs:// value that is not on a known media property', () => {
    const values = [value('some-other-property', null, 'ipfs://bafyloose')];

    expect(resolveMediaUrlSide(values, 'after')).toBe('ipfs://bafyloose');
  });
});

describe('resolveImageUrlFromEntity', () => {
  const WEB_URL = 'https://chat.example/debates/1/media/artifacts/preview_image/content';
  const entity = (...values: Array<{ propertyId: string; value: string }>) =>
    ({ values: values.map(v => ({ value: v.value, property: { id: v.propertyId } })) }) as unknown as Entity;

  it('reads an http(s) URL from the Web URL property', () => {
    expect(resolveImageUrlFromEntity(entity({ propertyId: WEB_URL_PROPERTY, value: WEB_URL }))).toBe(WEB_URL);
  });

  it('ignores http(s) values on any other property', () => {
    const page = entity({ propertyId: 'some-source-property', value: 'https://example.com/article' });
    expect(resolveImageUrlFromEntity(page)).toBeNull();
  });

  it('prefers an ipfs:// value from any property', () => {
    const both = entity(
      { propertyId: WEB_URL_PROPERTY, value: WEB_URL },
      { propertyId: 'loose', value: 'ipfs://bafyold' }
    );
    expect(resolveImageUrlFromEntity(both)).toBe('ipfs://bafyold');
  });

  it('returns null for a missing entity', () => {
    expect(resolveImageUrlFromEntity(undefined)).toBeNull();
  });
});
