import { SystemIds } from '@geoprotocol/geo-sdk/lite';
import { renderHook } from '@testing-library/react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useCollection } from './use-collection';

const BLOCK = 'block-1';

const mocks = vi.hoisted(() => ({
  blockEntity: null as any,
  initialBlockEntities: [] as any[],
}));

vi.mock('./use-data-block', () => ({ useDataBlockInstance: () => ({ entityId: 'block-1', spaceId: 'space-1' }) }));
vi.mock('~/core/state/editor/use-editor-blocks', () => ({
  useEditorStoreLite: () => ({ initialBlockEntities: mocks.initialBlockEntities, initialCollectionItems: {} }),
}));
vi.mock('~/core/sync/use-store', () => ({
  useQueryEntity: () => ({ entity: mocks.blockEntity, isLoading: false }),
  useQueryEntities: () => ({ entities: [], isLoading: false, isPlaceholderData: false }),
}));

const blockWithItems = (count: number) => ({
  id: BLOCK,
  values: [],
  relations: Array.from({ length: count }, (_, i) => ({
    id: `item-${i}`,
    fromEntity: { id: BLOCK },
    toEntity: { id: `entity-${i}` },
    type: { id: SystemIds.COLLECTION_ITEM_RELATION_TYPE },
    position: null,
  })),
});

const run = (where?: Record<string, unknown>) =>
  renderHook(() => useCollection({ source: { type: 'COLLECTION', value: BLOCK }, first: 9, where: where as any }))
    .result.current;

beforeEach(() => {
  mocks.blockEntity = null;
  mocks.initialBlockEntities = [];
});

describe('useCollection length', () => {
  it('is not known while the block entity holding the items has not loaded', () => {
    const { collectionLength, collectionLengthKnown } = run();

    expect(collectionLength).toBe(0);
    expect(collectionLengthKnown).toBe(false);
  });

  it.each([
    ['from the page', 'initial'],
    ['from the store', 'store'],
  ])('is known once the block entity has loaded %s, including a known 0', (_, from) => {
    for (const items of [0, 3]) {
      if (from === 'initial') mocks.initialBlockEntities = [blockWithItems(items)];
      else mocks.blockEntity = blockWithItems(items);

      const { collectionLength, collectionLengthKnown } = run();

      expect([collectionLength, collectionLengthKnown]).toEqual([items, true]);
    }
  });

  it('is not known under a filter, which waits on the items it filters', () => {
    mocks.blockEntity = blockWithItems(3);

    expect(run({ name: { contains: 'a' } }).collectionLengthKnown).toBe(false);
  });
});
