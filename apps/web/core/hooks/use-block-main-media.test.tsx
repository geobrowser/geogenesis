import { renderHook } from '@testing-library/react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Property } from '~/core/types';

const mocks = vi.hoisted(() => ({
  hydrateCalls: [] as Array<{ ids: string[]; enabled?: boolean }>,
  isFetched: false,
  values: [] as Array<{ entity: { id: string }; property: { id: string }; value: string }>,
}));

vi.mock('~/core/sync/use-store', () => ({
  useHydrateEntities: (options: { ids: string[]; enabled?: boolean }) => {
    mocks.hydrateCalls.push(options);
    return { isFetched: options.enabled === false ? false : mocks.isFetched };
  },
  useValues: ({ selector }: { selector: (v: unknown) => boolean }) => mocks.values.filter(selector),
}));

const { useBlockMainMedia } = await import('./use-block-main-media');
const { PROPERTY_HEIGHT_PIXELS_ID, PROPERTY_WIDTH_PIXELS_ID } = await import('~/core/constants');

const NAME_PROPERTY = 'a126ca530c8e48d5b88882c734c38935';
const COVER_PROPERTY = 'cover00000000000000000000000001';

const coverProperty = { id: COVER_PROPERTY, name: 'Cover', renderableTypeStrict: 'IMAGE' } as unknown as Property;
const schema = { [COVER_PROPERTY]: coverProperty };

beforeEach(() => {
  mocks.hydrateCalls = [];
  mocks.isFetched = false;
  mocks.values = [];
});

describe('useBlockMainMedia', () => {
  it('hydrates every shown column without waiting to learn which one holds the media', () => {
    // The property schema hasn't resolved yet, so `properties` is empty and no media column is
    // identifiable — the fetch still has to be in flight, or the dimensions land after the rows.
    renderHook(() => useBlockMainMedia([NAME_PROPERTY, COVER_PROPERTY], {}));

    expect(mocks.hydrateCalls[0]?.ids).toEqual([NAME_PROPERTY, COVER_PROPERTY]);
  });

  it('skips the fetch for views that never size themselves from the dimensions', () => {
    const { result } = renderHook(() =>
      useBlockMainMedia([NAME_PROPERTY, COVER_PROPERTY], schema, { readsDimensions: false })
    );

    expect(mocks.hydrateCalls[0]?.enabled).toBe(false);
    // Nothing is waiting on a fetch that isn't happening.
    expect(result.current.isFramePending).toBe(false);
    expect(result.current.mainMedia?.propertyId).toBe(COVER_PROPERTY);
  });

  it('reports the frame as pending until the shown columns are hydrated', () => {
    const { result } = renderHook(() => useBlockMainMedia([NAME_PROPERTY, COVER_PROPERTY], schema));

    expect(result.current.isFramePending).toBe(true);
  });

  it('reports the frame as pending even before the schema identifies a media column', () => {
    const { result } = renderHook(() => useBlockMainMedia([NAME_PROPERTY, COVER_PROPERTY], {}));

    expect(result.current.mainMedia).toBeNull();
    expect(result.current.isFramePending).toBe(true);
  });

  it('clears pending once the columns are hydrated, even with no dimensions configured', () => {
    mocks.isFetched = true;

    const { result } = renderHook(() => useBlockMainMedia([NAME_PROPERTY, COVER_PROPERTY], schema));

    expect(result.current.isFramePending).toBe(false);
    expect(result.current.mainMedia?.dimensions).toEqual({ width: null, height: null, aspectRatio: null });
  });

  it('resolves the configured dimensions off the hydrated property entity', () => {
    mocks.isFetched = true;
    mocks.values = [
      { entity: { id: COVER_PROPERTY }, property: { id: PROPERTY_WIDTH_PIXELS_ID }, value: '1080' },
      { entity: { id: COVER_PROPERTY }, property: { id: PROPERTY_HEIGHT_PIXELS_ID }, value: '1920' },
    ];

    const { result } = renderHook(() => useBlockMainMedia([NAME_PROPERTY, COVER_PROPERTY], schema));

    expect(result.current.isFramePending).toBe(false);
    expect(result.current.mainMedia).toMatchObject({
      propertyId: COVER_PROPERTY,
      kind: 'IMAGE',
      dimensions: { width: 1080, height: 1920, aspectRatio: '1080 / 1920' },
    });
  });

  it('is not pending when the block has no columns to hydrate', () => {
    const { result } = renderHook(() => useBlockMainMedia([], {}));

    expect(result.current.isFramePending).toBe(false);
  });

  describe('when the server already sent the property down with the page', () => {
    // A property entity in the store always has at least a name, which is what tells
    // "hydrated, configures no size" apart from "not fetched yet".
    const hydratedProperty = [
      { entity: { id: COVER_PROPERTY }, property: { id: 'name-property' }, value: 'Cover' },
      { entity: { id: COVER_PROPERTY }, property: { id: PROPERTY_WIDTH_PIXELS_ID }, value: '1080' },
      { entity: { id: COVER_PROPERTY }, property: { id: PROPERTY_HEIGHT_PIXELS_ID }, value: '1920' },
    ];

    it('has the frame on the first render, with no fetch in flight', () => {
      mocks.values = hydratedProperty;

      const { result } = renderHook(() => useBlockMainMedia([NAME_PROPERTY, COVER_PROPERTY], schema));

      expect(result.current.isFramePending).toBe(false);
      expect(result.current.mainMedia?.dimensions.aspectRatio).toBe('1080 / 1920');
    });

    it('skips the fetch entirely', () => {
      mocks.values = hydratedProperty;

      renderHook(() => useBlockMainMedia([NAME_PROPERTY, COVER_PROPERTY], schema));

      expect(mocks.hydrateCalls[0]?.enabled).toBe(false);
    });

    it('does not wait on a property that is hydrated but configures no size', () => {
      mocks.values = [{ entity: { id: COVER_PROPERTY }, property: { id: 'name-property' }, value: 'Cover' }];

      const { result } = renderHook(() => useBlockMainMedia([NAME_PROPERTY, COVER_PROPERTY], schema));

      expect(result.current.isFramePending).toBe(false);
      expect(result.current.mainMedia?.dimensions).toEqual({ width: null, height: null, aspectRatio: null });
    });
  });
});
