import { renderHook } from '@testing-library/react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Value } from '~/core/types';

import { DATA_BLOCK_INFINITE_SCROLL_PROPERTY_ID } from './block-ontology-ids';

const BLOCK_ENTITY_ID = 'block-entity-1';
const RELATION_ENTITY_ID = 'blocks-relation-1';
const SPACE_ID = 'space-1';

const storeValues = vi.hoisted(() => ({ current: [] as Value[] }));
const snapshotValues = vi.hoisted(() => ({ current: [] as Value[] }));

vi.mock('./use-data-block', () => ({
  useDataBlockInstance: () => ({ entityId: BLOCK_ENTITY_ID, spaceId: SPACE_ID, relationId: RELATION_ENTITY_ID }),
}));

vi.mock('~/core/state/editor/use-editor', () => ({
  useEditorStoreLite: () => ({
    blockRelations: [],
    initialBlockEntities: [{ id: RELATION_ENTITY_ID, values: snapshotValues.current }],
  }),
}));

// Mirrors the real `useValues`: deleted values are filtered out unless `includeDeleted` is set.
vi.mock('~/core/sync/use-store', () => ({
  useValues: ({ selector, includeDeleted = false }: { selector?: (v: Value) => boolean; includeDeleted?: boolean }) =>
    storeValues.current.filter(v => (selector ? selector(v) : true) && (includeDeleted ? true : !v.isDeleted)),
}));

const { useBlockInfiniteScroll } = await import('./use-block-infinite-scroll');

function infiniteScrollValue(overrides: Partial<Value> = {}): Value {
  return {
    id: `${SPACE_ID}:${RELATION_ENTITY_ID}:${DATA_BLOCK_INFINITE_SCROLL_PROPERTY_ID}`,
    entity: { id: RELATION_ENTITY_ID, name: null },
    property: { id: DATA_BLOCK_INFINITE_SCROLL_PROPERTY_ID, name: 'Infinite scroll', dataType: 'BOOLEAN' },
    value: '1',
    spaceId: SPACE_ID,
    isDeleted: false,
    isLocal: false,
    hasBeenPublished: true,
    ...overrides,
  };
}

describe('useBlockInfiniteScroll', () => {
  beforeEach(() => {
    storeValues.current = [];
    snapshotValues.current = [];
  });

  it('is off when nothing has ever set the property', () => {
    const { result } = renderHook(() => useBlockInfiniteScroll());
    expect(result.current).toBe(false);
  });

  it('reads a published value from the store', () => {
    storeValues.current = [infiniteScrollValue()];
    const { result } = renderHook(() => useBlockInfiniteScroll());
    expect(result.current).toBe(true);
  });

  it('falls back to the server snapshot when the store has no entry', () => {
    snapshotValues.current = [infiniteScrollValue()];
    const { result } = renderHook(() => useBlockInfiniteScroll());
    expect(result.current).toBe(true);
  });

  // The regression this hook shipped with: deleting tombstones the value rather than removing it,
  // so a hook that filtered tombstones out fell through to the snapshot and kept reporting `true`
  // until the next publish + reload.
  it('honors a local deletion instead of falling back to the stale snapshot', () => {
    snapshotValues.current = [infiniteScrollValue()];
    storeValues.current = [infiniteScrollValue({ isDeleted: true, isLocal: true, hasBeenPublished: false })];

    const { result } = renderHook(() => useBlockInfiniteScroll());
    expect(result.current).toBe(false);
  });

  it('prefers a local edit over the published value', () => {
    storeValues.current = [
      infiniteScrollValue({ value: '1' }),
      infiniteScrollValue({ value: '0', isLocal: true, hasBeenPublished: false }),
    ];

    const { result } = renderHook(() => useBlockInfiniteScroll());
    expect(result.current).toBe(false);
  });

  it('matches the property id regardless of dashes or case', () => {
    storeValues.current = [
      infiniteScrollValue({
        property: {
          id: '456D5852-79FD-4915-ACA8-20FF0A97B389',
          name: 'Infinite scroll',
          dataType: 'BOOLEAN',
        },
      }),
    ];

    const { result } = renderHook(() => useBlockInfiniteScroll());
    expect(result.current).toBe(true);
  });

  it('ignores a value written in another space', () => {
    storeValues.current = [infiniteScrollValue({ spaceId: 'other-space' })];
    const { result } = renderHook(() => useBlockInfiniteScroll());
    expect(result.current).toBe(false);
  });
});
