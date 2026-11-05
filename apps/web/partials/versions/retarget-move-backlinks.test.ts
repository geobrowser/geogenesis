import { IdUtils, SystemIds } from '@geoprotocol/geo-sdk';

import { Effect } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DATA_TYPE_PROPERTY, RELATION_ENTITY_RELATIONSHIP_TYPE, RENDERABLE_TYPE_PROPERTY } from '~/core/constants';
import type { Relation } from '~/core/types';
import { prepareLocalDataForPublishing } from '~/core/utils/publish/publish';

const store = vi.hoisted(() => ({ relations: [] as any[], values: [] as any[], written: [] as any[] }));

vi.mock('~/core/sync/use-store', () => ({
  getRelations: ({
    selector,
    mergeWith = [],
    includeDeleted = false,
  }: {
    selector?: (r: any) => boolean;
    mergeWith?: any[];
    includeDeleted?: boolean;
  }) =>
    [...store.relations, ...mergeWith.filter(m => !store.relations.some(r => r.id === m.id))].filter(
      r => (selector ? selector(r) : true) && (includeDeleted || !r.isDeleted)
    ),
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

const SCHEMA_RELATION_TYPES = [
  ['a Types relation', SystemIds.TYPES_PROPERTY],
  ["a property's relation value type", SystemIds.RELATION_VALUE_RELATIONSHIP_TYPE],
  ["a property's relation entity type", RELATION_ENTITY_RELATIONSHIP_TYPE],
  ["a property's data type", DATA_TYPE_PROPERTY],
  ["a property's renderable type", RENDERABLE_TYPE_PROPERTY],
];

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

  it('retargets a backlink only the loaded backlinks know about', () => {
    const backlinks = [relation({ id: 'unopened', from: 'unopened-entity', to: ENTITY })];

    retargetMoveBacklinks(ENTITY, SOURCE, TARGET, storage, backlinks as any);

    expect(store.written.map(r => [r.id, r.toSpaceId])).toEqual([['unopened', TARGET]]);
  });

  it('retargets a link back from a kept block known only from the loaded subtree', () => {
    const loaded = [relation({ id: 'kept-block-link', from: 'kept-block', to: ENTITY })];

    retargetMoveBacklinks(ENTITY, SOURCE, TARGET, storage, loaded as any);

    expect(store.written.map(r => [r.id, r.toSpaceId])).toEqual([['kept-block-link', TARGET]]);
  });

  it('leaves a loaded link alone when the move already deleted it in the store', () => {
    const link = relation({ id: 'removed-block-link', from: 'removed-block', to: ENTITY });
    store.relations = [{ ...link, isDeleted: true }];

    retargetMoveBacklinks(ENTITY, SOURCE, TARGET, storage, [link] as any);

    expect(store.written).toEqual([]);
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

  it.each(SCHEMA_RELATION_TYPES)(
    "leaves %s with no space hint alone, since unset means the type's own top space",
    (_, typeId) => {
      store.relations = [relation({ id: 'schema', from: 'an-instance', to: ENTITY, typeId })];

      expect(run()).toEqual([]);
    }
  );

  it.each(SCHEMA_RELATION_TYPES)('still retargets %s pinned to the source space', (_, typeId) => {
    store.relations = [relation({ id: 'schema', from: 'an-instance', to: ENTITY, typeId, toSpaceId: SOURCE })];

    expect(run().map(r => [r.id, r.toSpaceId])).toEqual([['schema', TARGET]]);
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
