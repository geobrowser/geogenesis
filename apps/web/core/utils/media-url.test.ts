import { describe, expect, it } from 'vitest';

import { findMediaUrlValue, isDirectMediaUrl } from './media-url';
import { getRelationVideoUrls, isPlayableVideoUrl } from './relation-video';

const CALL_PAGE =
  'https://www.geobrowser.io/space/c9f267dcb0d270718c2a3c45a64afd32/calls/0d9c5b2e7a114f3c9e2d8b6a4f1c3e70';

describe('a Geo call page is never a video source', () => {
  it('is not a direct media URL or a playable video', () => {
    expect(isDirectMediaUrl(CALL_PAGE)).toBe(false);
    expect(isPlayableVideoUrl(CALL_PAGE)).toBe(false);
    expect(isDirectMediaUrl('https://cdn.example.com/a.mp4')).toBe(true);
    expect(isPlayableVideoUrl('ipfs://bafy')).toBe(true);
  });

  it('is not read off a Video entity, nor off a Recordings relation', () => {
    expect(
      findMediaUrlValue([{ value: CALL_PAGE, property: { id: '412ff593e9154012a43d4c27ec5c68b6' } }])
    ).toBeUndefined();
    const relation = { type: { id: 'p' }, toEntity: { value: CALL_PAGE } } as never;
    expect(getRelationVideoUrls([relation], 'p')).toEqual([]);
  });
});
