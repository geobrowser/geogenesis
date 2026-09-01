import { ContentIds, SystemIds } from '@geoprotocol/geo-sdk/lite';

import { describe, expect, it } from 'vitest';

import { resolveMediaUrlSide } from './diff';

// The same ids `diff.ts` matches on, straight from the SDK.
const IPFS_URL_PROPERTY = SystemIds.IMAGE_URL_PROPERTY;
const WEB_URL_PROPERTY = ContentIds.WEB_URL_PROPERTY;

const value = (propertyId: string, before: string | null, after: string | null) => ({
  propertyId,
  before,
  after,
});

describe('resolveMediaUrlSide', () => {
  // The reason each side is resolved on its own. A proposal that moves media off IPFS carries the
  // removal and the addition together; reading both sides off whichever value matched first would
  // take `after: null` from the IPFS entry and render the media as deleted.
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

  // Image entities also carry width/height, which must never be mistaken for the media URL.
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
