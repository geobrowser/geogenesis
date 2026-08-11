import { describe, expect, it } from 'vitest';

import { type BlockMediaDimensions, blockMediaFrame } from './use-block-media-dimensions';

function dimensions(partial: Partial<BlockMediaDimensions>): BlockMediaDimensions {
  const width = partial.width ?? null;
  const height = partial.height ?? null;

  return {
    width,
    height,
    aspectRatio: partial.aspectRatio ?? (width != null && height != null ? `${width} / ${height}` : null),
  };
}

describe('blockMediaFrame', () => {
  it('falls back to the view default when nothing is configured', () => {
    const frame = blockMediaFrame(dimensions({}));

    expect(frame.style).toBeUndefined();
    expect(frame.hasCustomHeight).toBe(false);
  });

  it('sets an aspect ratio when both dimensions are configured', () => {
    const frame = blockMediaFrame(dimensions({ width: 1080, height: 1920 }));

    expect(frame.style).toEqual({ aspectRatio: '1080 / 1920' });
    expect(frame.hasCustomHeight).toBe(true);
  });

  it('sets an explicit height when only the height is configured', () => {
    const frame = blockMediaFrame(dimensions({ height: 320 }));

    expect(frame.style).toEqual({ height: 320 });
    expect(frame.hasCustomHeight).toBe(true);
  });

  it('ignores a width-only config on frames that size to their column', () => {
    const frame = blockMediaFrame(dimensions({ width: 320 }));

    expect(frame.style).toBeUndefined();
    expect(frame.hasCustomHeight).toBe(false);
  });

  it('applies the width on fixed-width frames', () => {
    expect(blockMediaFrame(dimensions({ width: 320 }), { allowWidth: true }).style).toEqual({ width: 320 });
    expect(blockMediaFrame(dimensions({ width: 320, height: 180 }), { allowWidth: true }).style).toEqual({
      width: 320,
      aspectRatio: '320 / 180',
    });
  });
});
