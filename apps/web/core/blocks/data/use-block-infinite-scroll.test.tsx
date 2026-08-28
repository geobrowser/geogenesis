import { renderHook } from '@testing-library/react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Value } from '~/core/types';

import { DATA_BLOCK_INFINITE_SCROLL_PROPERTY_ID } from './block-ontology-ids';

const BLOCK_ENTITY_ID = 'block-entity-1';
const RELATION_ENTITY_ID = 'blocks-relation-1';
const SPACE_ID = 'space-1';

const storeValues = vi.hoisted(() => ({ current: [] as Value[] }));
const snapshotValues = vi.hoisted(() => ({ current: [] as Value[] }));
const instance = vi.hoisted(() => ({ relationId: '' }));
const blockRelations = vi.hoisted(() => ({ current: [] as { entityId: string; toEntity: { id: string } }[] }));

vi.mock('./use-data-block', () => ({
  useDataBlockInstance: () => ({ entityId: BLOCK_ENTITY_ID, spaceId: SPACE_ID, relationId: instance.relationId }),
}));

vi.mock('~/core/state/editor/use-editor', () => ({
  useEditorStoreLite: () => ({
    blockRelations: blockRelations.current,
    initialBlockEntities: [{ id: RELATION_ENTITY_ID, values: snapshotValues.current }],
  }),
}));

// Mirrors the real `useValues`: deleted values are filtered out unless `includeDeleted` is set.
vi.mock('~/core/sync/use-store', () => ({
  useValues: ({ selector, includeDeleted = false }: { selector?: (v: Value) => boolean; includeDeleted?: boolean }) =>
    storeValues.current.filter(v => (selector ? selector(v) : true) && (includeDeleted ? true : !v.isDeleted)),
}));

const { useBlockInfiniteScroll } = await import('./use-block-infinite-scroll');

// Mirrors `ID.createValueId` — `${spaceId}:${entityId}:${propertyId}`. The store is keyed by this,
// so two values sharing a (space, entity, property) triple cannot coexist in `reactiveValues`.
function valueId(spaceId: string, entityId: string): string {
  return `${spaceId}:${entityId}:${DATA_BLOCK_INFINITE_SCROLL_PROPERTY_ID}`;
}

function infiniteScrollValue(overrides: Partial<Value> = {}): Value {
  return {
    id: valueId(overrides.spaceId ?? SPACE_ID, overrides.entity?.id ?? RELATION_ENTITY_ID),
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
    instance.relationId = RELATION_ENTITY_ID;
    blockRelations.current = [];
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

  // A local edit replaces the published value in the store rather than sitting alongside it — they
  // share a value id — so what this pins is that an unpublished edit is honored on its own.
  it('reads an unpublished local edit', () => {
    storeValues.current = [infiniteScrollValue({ value: '0', isLocal: true, hasBeenPublished: false })];

    const { result } = renderHook(() => useBlockInfiniteScroll());
    expect(result.current).toBe(false);
  });

  // `HexId` (core/io/schema.ts) is /^[0-9a-f]{32}$/i, so a dashed id can never reach the store —
  // but uppercase hex passes the schema and would be missed by a strict `===`.
  it('matches the property id regardless of case', () => {
    storeValues.current = [
      infiniteScrollValue({
        property: {
          id: DATA_BLOCK_INFINITE_SCROLL_PROPERTY_ID.toUpperCase(),
          name: 'Infinite scroll',
          dataType: 'BOOLEAN',
        },
      }),
    ];

    const { result } = renderHook(() => useBlockInfiniteScroll());
    expect(result.current).toBe(true);
  });

  // Without the entity scoping in the selector, every block on the page inherits infinite scroll
  // from any other block's relation entity in the same space.
  it('ignores a value on a different block’s relation entity', () => {
    storeValues.current = [
      infiniteScrollValue({ entity: { id: 'some-other-blocks-relation', name: null } }),
    ];

    const { result } = renderHook(() => useBlockInfiniteScroll());
    expect(result.current).toBe(false);
  });

  it('ignores a value written in another space', () => {
    storeValues.current = [infiniteScrollValue({ spaceId: 'other-space' })];
    const { result } = renderHook(() => useBlockInfiniteScroll());
    expect(result.current).toBe(false);
  });

  describe('when the block instance has no relationId', () => {
    it('falls back to the Blocks relation that points at this block', () => {
      instance.relationId = '';
      blockRelations.current = [{ entityId: RELATION_ENTITY_ID, toEntity: { id: BLOCK_ENTITY_ID } }];
      storeValues.current = [infiniteScrollValue()];

      const { result } = renderHook(() => useBlockInfiniteScroll());
      expect(result.current).toBe(true);
    });

    // With no relation entity to key off there is nothing to match against, so the block must not
    // pick up a value belonging to some other entity.
    it('is off when no relation resolves at all', () => {
      instance.relationId = '';
      blockRelations.current = [];
      storeValues.current = [infiniteScrollValue()];

      const { result } = renderHook(() => useBlockInfiniteScroll());
      expect(result.current).toBe(false);
    });
  });
});
