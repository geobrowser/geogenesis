import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { Effect } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { loadMoveBacklinks } from './load-move-backlinks';

const mocks = vi.hoisted(() => ({
  relations: [] as any[],
  backlinks: {} as Record<string, { id: string }[]>,
  entities: [] as any[],
  failBacklinks: false as boolean | string,
  syncedIds: [] as string[][],
  requested: [] as string[],
  inFlight: 0,
  maxInFlight: 0,
}));

const CONCURRENCY = vi.hoisted(() => 3);

vi.mock('~/core/sync/use-store', () => ({
  getRelations: ({ selector, mergeWith = [] }: { selector?: (r: any) => boolean; mergeWith?: any[] }) =>
    [...mocks.relations, ...mergeWith.filter(m => !mocks.relations.some(r => r.id === m.id))].filter(r =>
      selector ? selector(r) : true
    ),
  getValues: () => [],
}));

vi.mock('~/core/io/queries', () => ({
  ENTITY_ID_BATCH_CONCURRENCY: CONCURRENCY,
  getEntityBacklinks: (id: string) =>
    Effect.gen(function* () {
      mocks.requested.push(id);
      mocks.inFlight++;
      mocks.maxInFlight = Math.max(mocks.maxInFlight, mocks.inFlight);
      yield* Effect.promise(() => new Promise(resolve => setTimeout(resolve, 0)));
      mocks.inFlight--;
      if (mocks.failBacklinks === true || mocks.failBacklinks === id) return yield* Effect.fail(new Error('network'));
      return mocks.backlinks[id] ?? [];
    }),
}));

vi.mock('~/core/sync/orm', () => ({
  E: {
    syncMany: async ({ where }: { where: { id: { in: string[] } } }) => {
      mocks.syncedIds.push(where.id.in);
      return { merged: mocks.entities.filter(e => where.id.in.includes(e.id)), remote: [] };
    },
  },
}));

const SOURCE = 'space-source';
const OTHER = 'space-other';
const ENTITY = 'entity-moved';

const relation = (over: Record<string, any>) => ({
  id: over.id,
  entityId: over.id,
  spaceId: over.spaceId ?? SOURCE,
  type: { id: over.typeId ?? 'some-property' },
  fromEntity: { id: over.from },
  toEntity: { id: over.to },
  ...over,
});

const blocks = (count: number) =>
  Array.from({ length: count }, (_, i) =>
    relation({ id: `contains-block-${i}`, from: ENTITY, to: `block-${i}`, typeId: SystemIds.BLOCKS })
  );

const run = () => loadMoveBacklinks({ entityId: ENTITY, sourceSpaceId: SOURCE, store: {} as any, cache: {} as any });

beforeEach(() => {
  mocks.relations = [];
  mocks.backlinks = {};
  mocks.entities = [];
  mocks.failBacklinks = false;
  mocks.syncedIds = [];
  mocks.requested = [];
  mocks.inFlight = 0;
  mocks.maxInFlight = 0;
});

describe('loadMoveBacklinks', () => {
  it('returns the relation rows of entities that link to the moved entity, from any space', async () => {
    mocks.backlinks = { [ENTITY]: [{ id: 'linker' }] };
    mocks.entities = [
      {
        id: 'linker',
        relations: [
          relation({ id: 'to-moved', from: 'linker', to: ENTITY, spaceId: OTHER, toSpaceId: SOURCE }),
          relation({ id: 'to-elsewhere', from: 'linker', to: 'unrelated' }),
        ],
      },
    ];

    expect((await run()).map(r => r.id)).toEqual(['to-moved']);
  });

  it('looks up backlinks to each block in the subtree too', async () => {
    mocks.relations = [relation({ id: 'contains-block', from: ENTITY, to: 'block', typeId: SystemIds.BLOCKS })];
    mocks.backlinks = { block: [{ id: 'sharer' }] };
    mocks.entities = [
      { id: 'sharer', relations: [relation({ id: 'shares', from: 'sharer', to: 'block', typeId: SystemIds.BLOCKS })] },
    ];

    expect((await run()).map(r => r.id)).toEqual(['shares']);
  });

  it('does not load the subtree, whose relations the store already holds', async () => {
    mocks.relations = [relation({ id: 'contains-block', from: ENTITY, to: 'block', typeId: SystemIds.BLOCKS })];
    mocks.backlinks = { block: [{ id: ENTITY }] };

    expect(await run()).toEqual([]);
    expect(mocks.syncedIds).toEqual([]);
  });

  it('rejects when a backlink lookup fails, so the move can stop before writing', async () => {
    mocks.failBacklinks = true;

    await expect(run()).rejects.toThrow();
  });

  it('looks up backlinks to a block that was only loaded', async () => {
    const loaded = [
      {
        id: ENTITY,
        values: [],
        relations: [relation({ id: 'has-tab', from: ENTITY, to: 'tab', typeId: SystemIds.TABS_PROPERTY })],
      },
      {
        id: 'tab',
        values: [],
        relations: [relation({ id: 'tab-holds-block', from: 'tab', to: 'block', typeId: SystemIds.BLOCKS })],
      },
    ];

    await loadMoveBacklinks({
      entityId: ENTITY,
      sourceSpaceId: SOURCE,
      store: {} as any,
      cache: {} as any,
      loaded: loaded as any,
    });

    expect([...mocks.requested].sort()).toEqual([ENTITY, 'block', 'tab'].sort());
  });

  it('runs only a few lookups at a time on a long page, and still looks up every block once', async () => {
    mocks.relations = blocks(20);
    mocks.backlinks = { 'block-7': [{ id: 'sharer' }] };
    mocks.entities = [
      {
        id: 'sharer',
        relations: [relation({ id: 'shares', from: 'sharer', to: 'block-7', typeId: SystemIds.BLOCKS })],
      },
    ];

    expect((await run()).map(r => r.id)).toEqual(['shares']);
    expect(mocks.maxInFlight).toBe(CONCURRENCY);
    expect([...mocks.requested].sort()).toEqual([ENTITY, ...Array.from({ length: 20 }, (_, i) => `block-${i}`)].sort());
  });

  it('starts no more lookups once one has failed', async () => {
    mocks.relations = blocks(20);
    mocks.failBacklinks = ENTITY;

    await expect(run()).rejects.toThrow();
    await new Promise(resolve => setTimeout(resolve, 10));

    expect(mocks.requested.length).toBeLessThan(21);
  });
});
