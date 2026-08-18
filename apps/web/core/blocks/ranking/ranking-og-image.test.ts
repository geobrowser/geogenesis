import { describe, expect, it } from 'vitest';

import { FILEBASE_GATEWAY_READ_PATH } from '~/core/constants';

import type { RankingOgEntryData } from './ranking-og-data';
import { resolveRankingOgEntryImageSrc } from './ranking-og-image';

function entry(partial: Partial<RankingOgEntryData> = {}): RankingOgEntryData {
  return {
    entityId: 'entry-1',
    name: 'Entry One',
    description: null,
    image: null,
    ...partial,
  };
}

describe('resolveRankingOgEntryImageSrc', () => {
  it('uses the placeholder image when an entry has no image', () => {
    expect(resolveRankingOgEntryImageSrc(entry())).toMatch(/^data:image\/png;base64,/);
  });

  it('uses the placeholder image when an entry image cannot be rendered by Satori', () => {
    expect(resolveRankingOgEntryImageSrc(entry({ image: 'https://example.com/image.jpg' }))).toMatch(
      /^data:image\/png;base64,/
    );
  });

  it('keeps renderable IPFS gateway images', () => {
    expect(resolveRankingOgEntryImageSrc(entry({ image: 'ipfs://bafy-image-cid' }))).toBe(
      `${FILEBASE_GATEWAY_READ_PATH}bafy-image-cid`
    );
  });
});
