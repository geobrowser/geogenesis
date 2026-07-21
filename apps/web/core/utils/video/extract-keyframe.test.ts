import { describe, expect, it } from 'vitest';

import { extractVideoKeyframe, keyframeFileExtension, keyframeSeekTarget } from './extract-keyframe';

describe('keyframeSeekTarget', () => {
  it('seeks to seekTime directly when the duration is unknown', () => {
    expect(keyframeSeekTarget(0.1, null)).toBe(0.1);
  });

  it('clamps to the first half so short clips still land on a real frame', () => {
    expect(keyframeSeekTarget(0.1, 0.1)).toBeCloseTo(0.05);
  });

  it('uses seekTime when the clip is long enough', () => {
    expect(keyframeSeekTarget(0.1, 60)).toBe(0.1);
  });
});

describe('keyframeFileExtension', () => {
  it('maps jpeg mime types to jpg', () => {
    expect(keyframeFileExtension('image/jpeg')).toBe('jpg');
    expect(keyframeFileExtension('image/jpg')).toBe('jpg');
  });

  it('derives the extension from other image subtypes', () => {
    expect(keyframeFileExtension('image/png')).toBe('png');
    expect(keyframeFileExtension('image/webp')).toBe('webp');
  });

  it('falls back to jpg for non-image mime types', () => {
    expect(keyframeFileExtension('application/octet-stream')).toBe('jpg');
  });
});

describe('extractVideoKeyframe', () => {
  it('returns null when DOM APIs are unavailable (SSR)', async () => {
    const originalDocument = globalThis.document;
    // @ts-expect-error simulate a non-DOM (server) environment
    delete globalThis.document;
    try {
      const file = new File([new Uint8Array([0])], 'clip.mp4', { type: 'video/mp4' });
      await expect(extractVideoKeyframe(file)).resolves.toBeNull();
    } finally {
      globalThis.document = originalDocument;
    }
  });
});
