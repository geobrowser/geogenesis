import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { Effect } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { loadMoveBacklinks } from './load-move-backlinks';

const mocks = vi.hoisted(() => ({
  relations: [] as any[],
  backlinks: {} as Record<string, { id: string }[]>,
  entities: [] as any[],
  failBacklinks: false,
  syncedIds: [] as string[][],
}));

vi.mock('~/core/sync/use-store', () => ({
  getRelations: ({ selector }: { selector?: (r: any) => boolean }) =>
    mocks.relations.filter(r => (selector ? selector(r) : true)),
  getValues: () => [],
}));

vi.mock('~/core/io/queries', () => ({
  getEntityBacklinks: (id: string) =>
    mocks.failBacklinks ? Effect.fail(new Error('network')) : Effect.succeed(mocks.backlinks[id] ?? []),
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

const run = () => loadMoveBacklinks({ entityId: ENTITY, sourceSpaceId: SOURCE, store: {} as any, cache: {} as any });

beforeEach(() => {
  mocks.relations = [];
  mocks.backlinks = {};
  mocks.entities = [];
  mocks.failBacklinks = false;
  mocks.syncedIds = [];
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
});
