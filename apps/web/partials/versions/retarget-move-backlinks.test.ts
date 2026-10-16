import { beforeEach, describe, expect, it, vi } from 'vitest';

import { collectBacklinkRetargets } from './retarget-move-backlinks';

const store = vi.hoisted(() => ({ relations: [] as any[], values: [] as any[] }));

vi.mock('~/core/sync/use-store', () => ({
  getRelations: ({ selector }: { selector?: (r: any) => boolean }) =>
    store.relations.filter(r => (selector ? selector(r) : true)),
  getValues: ({ selector }: { selector?: (v: any) => boolean }) =>
    store.values.filter(v => (selector ? selector(v) : true)),
}));

const SOURCE = 'space-source';
const TARGET = 'space-target';
const OTHER = 'space-other';
const ENTITY = 'entity-moved';

const relation = (over: Partial<Record<string, any>>) => ({
  id: over.id,
  entityId: over.id,
  spaceId: over.spaceId ?? SOURCE,
  type: { id: over.typeId ?? 'some-property' },
  fromEntity: { id: over.from },
  toEntity: { id: over.to },
  ...over,
});

const run = () => collectBacklinkRetargets(ENTITY, SOURCE, TARGET);

beforeEach(() => {
  store.relations = [];
  store.values = [];
});

describe('collectBacklinkRetargets', () => {
  it('points a source-space backlink at the destination, keeping its own id and space', () => {
    store.relations = [relation({ id: 'backlink', from: 'other-entity', to: ENTITY, toSpaceId: SOURCE })];

    const [retargeted, ...rest] = run();

    expect(rest).toEqual([]);
    expect(retargeted?.toSpaceId).toBe(TARGET);
    expect(retargeted?.id).toBe('backlink');
    expect(retargeted?.spaceId).toBe(SOURCE);
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

  it('leaves a backlink with no space hint alone', () => {
    store.relations = [relation({ id: 'backlink', from: 'other-entity', to: ENTITY, toSpaceId: null })];

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
