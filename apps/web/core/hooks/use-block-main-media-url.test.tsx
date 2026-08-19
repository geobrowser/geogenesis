import { renderHook } from '@testing-library/react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  relation: null as null | Record<string, unknown>,
  keyframe: { url: undefined as string | undefined, isResolving: false },
  entityMedia: {
    avatarUrl: undefined as string | undefined,
    coverUrl: undefined as string | undefined,
    isResolving: false,
  },
  values: [] as Array<{ entity: { id: string }; value: string; spaceId: string }>,
}));

vi.mock('~/core/sync/use-store', () => ({
  useSpaceAwareRelation: () => mocks.relation,
  useValues: ({ selector }: { selector: (v: unknown) => boolean }) => mocks.values.filter(selector),
}));

vi.mock('~/core/utils/use-entity-media', () => ({
  useEntityMedia: () => mocks.entityMedia,
}));

vi.mock('./use-video-keyframe-url', () => ({
  useVideoKeyframeUrl: () => mocks.keyframe,
}));

const { useBlockMainMediaUrl } = await import('./use-block-main-media-url');

const VIDEO_PROPERTY = 'video000000000000000000000000001';
const row = { entityId: 'row-1', spaceId: 'space-1' };

beforeEach(() => {
  mocks.relation = null;
  mocks.keyframe = { url: undefined, isResolving: false };
  mocks.entityMedia = { avatarUrl: undefined, coverUrl: undefined, isResolving: false };
  mocks.values = [];
});

describe('useBlockMainMediaUrl', () => {
  describe('video media', () => {
    beforeEach(() => {
      mocks.relation = { toEntity: { id: 'video-entity' }, toSpaceId: 'space-1', renderableType: 'VIDEO' };
    });

    const renderVideo = () =>
      renderHook(() => useBlockMainMediaUrl({ ...row, mediaPropertyId: VIDEO_PROPERTY, mediaKind: 'VIDEO' }));

    it('reports resolving while the keyframe is still being fetched', () => {
      mocks.keyframe = { url: undefined, isResolving: true };

      const { result } = renderVideo();

      expect(result.current).toEqual({ url: undefined, isResolving: true });
    });

    it('stops resolving once the keyframe lands', () => {
      mocks.keyframe = { url: 'ipfs://keyframe', isResolving: false };

      const { result } = renderVideo();

      expect(result.current).toEqual({ url: 'ipfs://keyframe', isResolving: false });
    });

    it('stops resolving once the fetch settles with no keyframe', () => {
      // The caller can show its placeholder now — this video genuinely has none.
      mocks.keyframe = { url: undefined, isResolving: false };

      const { result } = renderVideo();

      expect(result.current).toEqual({ url: undefined, isResolving: false });
    });
  });

  describe('an entity’s own avatar / cover', () => {
    const renderCover = () => renderHook(() => useBlockMainMediaUrl({ ...row, mediaPropertyId: null }));

    it('reports resolving while the lookup is in flight', () => {
      mocks.entityMedia = { avatarUrl: undefined, coverUrl: undefined, isResolving: true };

      const { result } = renderCover();

      expect(result.current).toEqual({ url: undefined, isResolving: true });
    });

    it('stops resolving once the lookup settles empty', () => {
      const { result } = renderCover();

      expect(result.current).toEqual({ url: undefined, isResolving: false });
    });

    it('returns a resolved cover without reporting a wait', () => {
      mocks.entityMedia = { avatarUrl: undefined, coverUrl: 'ipfs://cover', isResolving: false };

      const { result } = renderCover();

      expect(result.current).toEqual({ url: 'ipfs://cover', isResolving: false });
    });
  });

  it('never reports a wait for an image relation that came down with the row', () => {
    // The relation is part of the row's own payload, so an absent one means "no image",
    // not "not loaded" — there's nothing further to wait for.
    mocks.relation = { toEntity: { id: 'image-entity', value: 'ipfs://image' }, toSpaceId: 'space-1' };

    const { result } = renderHook(() => useBlockMainMediaUrl({ ...row, mediaPropertyId: 'cover-property' }));

    expect(result.current).toEqual({ url: 'ipfs://image', isResolving: false });
  });
});
