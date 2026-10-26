import { SystemIds } from '@geoprotocol/geo-sdk/lite';
import { cleanup, renderHook } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Entity, Relation } from '~/core/types';

import { useEntityPageSurfaceData } from './use-entity-page-surface-data';

const mocks = vi.hoisted(() => ({
  blocks: [] as Entity[],
  loading: true,
  editing: false,
  empty: [] as Entity[],
  findMany: vi.fn(),
}));

vi.mock('~/core/sync/use-store', () => ({
  useQueryEntities: ({ where }: { where: { id: { in: string[] } } }) =>
    where.id.in.includes('block-1')
      ? { entities: mocks.blocks, isLoading: mocks.loading }
      : { entities: mocks.empty, isLoading: false },
  useQueryEntitiesAsync: () => mocks.findMany,
}));
vi.mock('~/core/state/entity-page-store/entity-store', () => ({
  useRelationEntityRelations: () => mocks.empty,
}));
vi.mock('~/core/hooks/use-user-is-editing', () => ({ useUserIsEditing: () => mocks.editing }));
vi.mock('~/core/blocks/data/fetch-collection-items', () => ({
  fetchCollectionItemsForBlocks: async () => ({}),
}));

function block(id: string): Entity {
  return { id, name: id, description: null, spaces: ['space'], types: [], relations: [], values: [] };
}

function blockRelation(id: string): Relation {
  return {
    id: `relation-${id}`,
    entityId: `relation-entity-${id}`,
    type: { id: SystemIds.BLOCKS, name: null },
    fromEntity: { id: 'entity', name: null },
    toEntity: { id, name: null, value: '' },
    renderableType: 'RELATION',
    spaceId: 'space',
  };
}

const entity: Entity = { ...block('entity'), relations: [blockRelation('block-1'), blockRelation('block-2')] };

beforeEach(() => {
  mocks.blocks = [];
  mocks.loading = true;
  mocks.editing = false;
});
afterEach(cleanup);

describe('side panel surface loading', () => {
  it('makes the entity available while its authored blocks are still loading', () => {
    const { result } = renderHook(() => useEntityPageSurfaceData('entity', 'space', entity, false));

    expect(result.current).toMatchObject({ isReady: true, isLoading: false, isLoadingBlocks: true });
  });

  it('renders cached blocks immediately while their query refreshes', () => {
    mocks.blocks = [block('block-1'), block('block-2')];
    const { result } = renderHook(() => useEntityPageSurfaceData('entity', 'space', entity, true));

    expect(result.current).toMatchObject({ isReady: true, isLoading: false, isLoadingBlocks: false });
    expect(result.current.blocks).toEqual(mocks.blocks);
  });

  it('keeps the editor loading when only some initial blocks are cached', () => {
    mocks.blocks = [block('block-1')];
    const { result, rerender } = renderHook(() => useEntityPageSurfaceData('entity', 'space', entity, false));
    expect(result.current.isLoadingBlocks).toBe(true);

    mocks.blocks = [...mocks.blocks, block('block-2')];
    rerender();

    expect(result.current.isLoadingBlocks).toBe(false);
    expect(result.current.blocks).toHaveLength(2);
  });

  it('waits for the initial block read before mounting an editable document', () => {
    mocks.editing = true;
    mocks.blocks = [block('block-1'), block('block-2')];
    const { result, rerender } = renderHook(() => useEntityPageSurfaceData('entity', 'space', entity, false));

    expect(result.current).toMatchObject({ isReady: true, isLoadingBlocks: true });
    mocks.loading = false;
    rerender();
    expect(result.current.isLoadingBlocks).toBe(false);
  });

  it('does not hold an entity with no authored blocks behind a loading state', () => {
    const noBlocksEntity = block('entity');
    const { result } = renderHook(() => useEntityPageSurfaceData('entity', 'space', noBlocksEntity, false));
    expect(result.current).toMatchObject({ isReady: true, isLoadingBlocks: false });
  });

  it('still waits for an entity that is not available yet', () => {
    const { result } = renderHook(() => useEntityPageSurfaceData('entity', 'space', null, true));
    expect(result.current).toMatchObject({ isReady: false, isLoading: true });
  });
});
