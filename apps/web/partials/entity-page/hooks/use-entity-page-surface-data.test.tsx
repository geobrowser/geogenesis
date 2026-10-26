import { SystemIds } from '@geoprotocol/geo-sdk/lite';
import { cleanup, renderHook } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Entity, Relation } from '~/core/types';

import { useEntityPageSurfaceData } from './use-entity-page-surface-data';

const mocks = vi.hoisted(() => ({
  blocks: [] as Entity[],
  loading: true,
  editing: false,
  activeTabId: null as string | null,
  tabs: [] as Entity[],
  tabsLoading: false,
  tabBlocks: [] as Entity[],
  tabBlocksLoading: false,
  empty: [] as Entity[],
  findMany: vi.fn(),
}));

vi.mock('~/core/sync/use-store', () => ({
  useQueryEntities: ({ where }: { where: { id: { in: string[] } } }) => {
    const ids = where.id.in;
    if (ids.includes('block-1')) return { entities: mocks.blocks, isLoading: mocks.loading };
    if (ids.includes('tab')) return { entities: mocks.tabs, isLoading: mocks.tabsLoading };
    if (ids.includes('tab-block')) return { entities: mocks.tabBlocks, isLoading: mocks.tabBlocksLoading };
    return { entities: mocks.empty, isLoading: false };
  },
  useQueryEntitiesAsync: () => mocks.findMany,
}));
vi.mock('~/core/state/entity-page-store/entity-store', () => ({
  useRelationEntityRelations: () => mocks.empty,
}));
vi.mock('~/core/hooks/use-user-is-editing', () => ({ useUserIsEditing: () => mocks.editing }));
vi.mock('~/core/state/entity-side-panel-active-tab', () => ({
  useEntitySidePanelActiveTab: () => ({ activeTabId: mocks.activeTabId }),
}));
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
const entityWithTab: Entity = {
  ...entity,
  relations: [...entity.relations, { ...blockRelation('tab'), type: { id: SystemIds.TABS_PROPERTY, name: null } }],
};
const tab: Entity = { ...block('tab'), relations: [blockRelation('tab-block')] };

beforeEach(() => {
  mocks.blocks = [];
  mocks.loading = true;
  mocks.editing = false;
  mocks.activeTabId = null;
  mocks.tabs = [];
  mocks.tabsLoading = false;
  mocks.tabBlocks = [];
  mocks.tabBlocksLoading = false;
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

  it('waits for the selected authored tab to arrive', () => {
    mocks.activeTabId = 'tab';
    mocks.tabsLoading = true;
    mocks.loading = false;
    const { result } = renderHook(() => useEntityPageSurfaceData('entity', 'space', entityWithTab, false));
    expect(result.current).toMatchObject({ isReady: true, isLoadingBlocks: true });
  });

  it("waits for an authored tab's missing blocks even when the overview has loaded", () => {
    mocks.activeTabId = 'tab';
    mocks.tabs = [tab];
    mocks.tabBlocksLoading = true;
    mocks.loading = false;
    const { result, rerender } = renderHook(() => useEntityPageSurfaceData('entity', 'space', entityWithTab, false));
    expect(result.current.isLoadingBlocks).toBe(true);

    mocks.tabBlocks = [block('tab-block')];
    rerender();
    expect(result.current.isLoadingBlocks).toBe(false);
  });

  it('shows a cached tab while unrelated overview blocks are loading', () => {
    mocks.activeTabId = 'tab';
    mocks.tabs = [tab];
    mocks.tabBlocks = [block('tab-block')];
    const { result } = renderHook(() => useEntityPageSurfaceData('entity', 'space', entityWithTab, false));
    expect(result.current.isLoadingBlocks).toBe(false);
  });

  it("does not block the overview on another tab's missing blocks", () => {
    mocks.blocks = [block('block-1'), block('block-2')];
    mocks.tabs = [tab];
    mocks.tabBlocksLoading = true;
    const { result } = renderHook(() => useEntityPageSurfaceData('entity', 'space', entityWithTab, false));
    expect(result.current.isLoadingBlocks).toBe(false);
  });
});
