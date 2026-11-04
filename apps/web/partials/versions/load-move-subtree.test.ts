import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { loadMoveSubtree } from './load-move-subtree';

const mocks = vi.hoisted(() => ({
  /** What the store holds. */
  relations: [] as any[],
  /** What the network has, by id. */
  remote: {} as Record<string, any>,
  /** What a page-by-page read of one entity returns, by id. */
  drained: {} as Record<string, any>,
  requests: [] as string[][],
  reloads: [] as string[],
  fail: false,
}));

vi.mock('~/core/sync/use-store', () => ({
  getRelations: ({ selector, mergeWith = [] }: { selector?: (r: any) => boolean; mergeWith?: any[] }) =>
    [...mocks.relations, ...mergeWith.filter(m => !mocks.relations.some(r => r.id === m.id))].filter(r =>
      selector ? selector(r) : true
    ),
  getValues: () => [],
}));

vi.mock('~/core/sync/orm', () => ({
  E: {
    syncMany: async ({ where }: { where: { id: { in: string[] } } }) => {
      mocks.requests.push([...where.id.in].sort());
      if (mocks.fail) throw new Error('network');
      const found = where.id.in.flatMap(id => (mocks.remote[id] ? [mocks.remote[id]] : []));
      return { merged: found, remote: found };
    },
    syncOne: async ({ id }: { id: string }) => {
      mocks.reloads.push(id);
      const drained = mocks.drained[id];
      if (drained instanceof Error) throw drained;
      // The store's copy still comes back when the network finds nothing.
      return { merged: drained ?? entity(id), remote: drained ?? null };
    },
  },
}));

const SOURCE = 'space-source';
const ENTITY = 'entity-moved';

const contains = (from: string, to: string, typeId: string = SystemIds.BLOCKS, spaceId = SOURCE) => ({
  id: `${from}->${to}`,
  entityId: `${from}->${to}`,
  spaceId,
  type: { id: typeId },
  fromEntity: { id: from },
  toEntity: { id: to },
});

const entity = (id: string, relations: any[] = []) => ({ id, values: [], relations });

const run = () => loadMoveSubtree({ entityId: ENTITY, sourceSpaceId: SOURCE, store: {} as any, cache: {} as any });

beforeEach(() => {
  mocks.relations = [];
  mocks.remote = {};
  mocks.drained = {};
  mocks.requests = [];
  mocks.reloads = [];
  mocks.fail = false;
});

describe('loadMoveSubtree', () => {
  it('loads a tab the store does not hold, and the blocks under it, one level at a time', async () => {
    mocks.relations = [contains(ENTITY, 'tab', SystemIds.TABS_PROPERTY)];
    mocks.remote = {
      [ENTITY]: entity(ENTITY, [contains(ENTITY, 'tab', SystemIds.TABS_PROPERTY)]),
      tab: entity('tab', [contains('tab', 'block')]),
      block: entity('block'),
    };

    const loaded = await run();

    expect(loaded.map(e => e.id).sort()).toEqual([ENTITY, 'block', 'tab'].sort());
    expect(mocks.requests).toEqual([[ENTITY, 'tab'].sort(), ['block']]);
  });

  it('loads the subtree once when the store already holds all of it', async () => {
    mocks.relations = [contains(ENTITY, 'block')];
    mocks.remote = { [ENTITY]: entity(ENTITY, [contains(ENTITY, 'block')]), block: entity('block') };

    expect((await run()).map(e => e.id).sort()).toEqual([ENTITY, 'block'].sort());
    expect(mocks.requests).toEqual([[ENTITY, 'block'].sort()]);
  });

  it('does not follow containment stored in another space', async () => {
    mocks.remote = { [ENTITY]: entity(ENTITY, [contains(ENTITY, 'block', SystemIds.BLOCKS, 'space-other')]) };

    await run();

    expect(mocks.requests).toEqual([[ENTITY]]);
  });

  it('stops at a block that contains its parent, asking for each id once', async () => {
    mocks.remote = {
      [ENTITY]: entity(ENTITY, [contains(ENTITY, 'block')]),
      block: entity('block', [contains('block', ENTITY)]),
    };

    await run();

    expect(mocks.requests.flat().sort()).toEqual([ENTITY, 'block'].sort());
  });

  it('rejects when a level fails to load, so the move can stop before writing', async () => {
    mocks.fail = true;

    await expect(run()).rejects.toThrow();
  });

  it('reloads a tab with more relations than a batch read returns, and keeps the blocks past the cap', async () => {
    mocks.remote = {
      [ENTITY]: entity(ENTITY, [contains(ENTITY, 'tab', SystemIds.TABS_PROPERTY)]),
      tab: { ...entity('tab', [contains('tab', 'block-1')]), relationsTotalCount: 1500 },
      'block-1': entity('block-1'),
      'block-1001': entity('block-1001'),
    };
    mocks.drained = { tab: entity('tab', [contains('tab', 'block-1'), contains('tab', 'block-1001')]) };

    const loaded = await run();

    expect(mocks.reloads).toEqual(['tab']);
    expect(loaded.map(e => e.id).sort()).toEqual([ENTITY, 'block-1', 'block-1001', 'tab'].sort());
    expect(loaded.find(e => e.id === 'tab')).toBe(mocks.drained.tab);
  });

  it('does not reload an entity whose relations all fit in a batch read', async () => {
    mocks.remote = {
      [ENTITY]: { ...entity(ENTITY, [contains(ENTITY, 'block')]), relationsTotalCount: 1000 },
      block: entity('block'),
    };

    expect((await run()).map(e => e.id).sort()).toEqual([ENTITY, 'block'].sort());
    expect(mocks.reloads).toEqual([]);
  });

  it('loads an entity with a dangling relation as usual', async () => {
    mocks.remote = {
      [ENTITY]: { ...entity(ENTITY, [contains(ENTITY, 'block')]), relationsTotalCount: 2, relationsComplete: false },
      block: entity('block'),
    };

    expect((await run()).map(e => e.id).sort()).toEqual([ENTITY, 'block'].sort());
    expect(mocks.reloads).toEqual([]);
  });

  it.each([
    ['finds nothing on the network', undefined],
    ['fails', new Error('network')],
  ])('rejects when the reload of a cut-off entity %s', async (_, drained) => {
    mocks.remote = { [ENTITY]: { ...entity(ENTITY), relationsTotalCount: 1500 } };
    mocks.drained = { [ENTITY]: drained };

    await expect(run()).rejects.toThrow();
  });
});
