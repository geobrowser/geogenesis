import { IdUtils } from '@geoprotocol/geo-sdk';

import { Effect } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Relation } from '~/core/types';
import { prepareLocalDataForPublishing } from '~/core/utils/publish/publish';

const store = vi.hoisted(() => ({ relations: [] as any[], values: [] as any[], written: [] as any[] }));

vi.mock('~/core/sync/use-store', () => ({
  getRelations: ({ selector }: { selector?: (r: any) => boolean }) =>
    store.relations.filter(r => (selector ? selector(r) : true)),
  getValues: ({ selector }: { selector?: (v: any) => boolean }) =>
    store.values.filter(v => (selector ? selector(v) : true)),
}));

vi.mock('~/core/sync/use-sync-engine', () => {
  const geoStore = {
    setRelation: (relation: any) => store.written.push({ ...relation, isLocal: true, hasBeenPublished: false }),
    deleteRelation: (relation: any) =>
      store.written.push({ ...relation, isDeleted: true, isLocal: true, hasBeenPublished: false }),
  };
  return { store: geoStore, useSyncEngine: () => ({ store: geoStore }) };
});

const { storage } = await import('~/core/sync/use-mutate');
const { retargetMoveBacklinks } = await import('./retarget-move-backlinks');

const SOURCE = IdUtils.generate();
const TARGET = IdUtils.generate();
const OTHER = IdUtils.generate();
const ENTITY = IdUtils.generate();

const relation = (over: Partial<Record<string, any>>) => ({
  id: over.id,
  entityId: over.id,
  spaceId: over.spaceId ?? SOURCE,
  type: { id: over.typeId ?? 'some-property' },
  fromEntity: { id: over.from },
  toEntity: { id: over.to },
  ...over,
});

const run = () => {
  retargetMoveBacklinks(ENTITY, SOURCE, TARGET, storage);
  return store.written as Relation[];
};

beforeEach(() => {
  store.relations = [];
  store.values = [];
  store.written = [];
});

describe('retargetMoveBacklinks', () => {
  it('points a source-space backlink at the destination, keeping its own id and space', () => {
    store.relations = [relation({ id: 'backlink', from: 'other-entity', to: ENTITY, toSpaceId: SOURCE })];

    const [retargeted, ...rest] = run();

    expect(rest).toEqual([]);
    expect(retargeted?.toSpaceId).toBe(TARGET);
    expect(retargeted?.id).toBe('backlink');
    expect(retargeted?.spaceId).toBe(SOURCE);
  });

  it('publishes a published backlink as an updateRelation with the new toSpace', () => {
    const id = IdUtils.generate();
    store.relations = [
      relation({ id, from: IdUtils.generate(), to: ENTITY, toSpaceId: SOURCE, typeId: IdUtils.generate() }),
    ];

    const ops = Effect.runSync(prepareLocalDataForPublishing([], run(), SOURCE));

    expect(ops.map(op => op.type)).toEqual(['updateRelation']);
    const [op] = ops as any[];
    expect(Array.from(op.id)).toEqual(Array.from(IdUtils.toBytes(id) as Uint8Array));
    expect(Array.from(op.toSpace)).toEqual(Array.from(IdUtils.toBytes(TARGET) as Uint8Array));
  });

  it('leaves a backlink held in another space alone', () => {
    store.relations = [
      relation({ id: 'elsewhere', from: 'other-entity', to: ENTITY, spaceId: OTHER, toSpaceId: SOURCE }),
    ];

    expect(run()).toEqual([]);
  });

  it('leaves a backlink that already points elsewhere alone', () => {
    store.relations = [relation({ id: 'backlink', from: 'other-entity', to: ENTITY, toSpaceId: OTHER })];

    expect(run()).toEqual([]);
  });

  it.each([null, undefined])('points a backlink with no space hint (%s) at the destination', toSpaceId => {
    store.relations = [relation({ id: 'backlink', from: 'other-entity', to: ENTITY, toSpaceId })];

    const [retargeted, ...rest] = run();

    expect(rest).toEqual([]);
    expect(retargeted?.id).toBe('backlink');
    expect(retargeted?.spaceId).toBe(SOURCE);
    expect(retargeted?.toSpaceId).toBe(TARGET);
  });

  it('leaves a backlink with no space hint held in another space alone', () => {
    store.relations = [relation({ id: 'elsewhere', from: 'other-entity', to: ENTITY, spaceId: OTHER })];

    expect(run()).toEqual([]);
  });

  it('ignores a relation the moved entity points at itself', () => {
    store.relations = [relation({ id: 'self', from: ENTITY, to: ENTITY, toSpaceId: SOURCE })];

    expect(run()).toEqual([]);
  });

  it('ignores a relation aimed at some other entity', () => {
    store.relations = [relation({ id: 'unrelated', from: 'a', to: 'b', toSpaceId: SOURCE })];

    expect(run()).toEqual([]);
  });
});
