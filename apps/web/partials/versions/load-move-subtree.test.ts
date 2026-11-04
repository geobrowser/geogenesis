import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { loadMoveSubtree } from './load-move-subtree';

const mocks = vi.hoisted(() => ({
  /** What the store holds. */
  relations: [] as any[],
  /** What the network has, by id. */
  remote: {} as Record<string, any>,
  requests: [] as string[][],
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
      return { merged: where.id.in.flatMap(id => (mocks.remote[id] ? [mocks.remote[id]] : [])), remote: [] };
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
  mocks.requests = [];
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
});
