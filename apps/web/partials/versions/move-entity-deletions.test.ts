import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { collectMoveDeletions } from './move-entity-deletions';

const store = vi.hoisted(() => ({ relations: [] as any[], values: [] as any[] }));

vi.mock('~/core/sync/use-store', () => ({
  getRelations: ({ selector }: { selector?: (r: any) => boolean }) =>
    store.relations.filter(r => (selector ? selector(r) : true)),
  getValues: ({ selector }: { selector?: (v: any) => boolean }) =>
    store.values.filter(v => (selector ? selector(v) : true)),
}));

const SOURCE = 'space-source';
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

const value = (entityId: string, spaceId: string, id: string) => ({ id, entity: { id: entityId }, spaceId });

beforeEach(() => {
  store.relations = [];
  store.values = [];
});

describe('collectMoveDeletions', () => {
  // The entity id does not change on a move, so a relation aimed at it still points somewhere
  // valid. Deleting by `toEntity` took out every backlink in the source space.
  it('leaves backlinks in the source space alone', () => {
    store.relations = [
      relation({ id: 'own-outgoing', from: ENTITY, to: 'somewhere' }),
      relation({ id: 'backlink', from: 'other-entity', to: ENTITY }),
    ];

    const { relations } = collectMoveDeletions(ENTITY, SOURCE);

    expect(relations.map(r => r.id)).toEqual(['own-outgoing']);
  });

  it('leaves backlinks in other spaces alone', () => {
    store.relations = [relation({ id: 'backlink-elsewhere', from: 'other-entity', to: ENTITY, spaceId: OTHER })];

    const { relations } = collectMoveDeletions(ENTITY, SOURCE);

    expect(relations).toHaveLength(0);
  });

  it('deletes the entity own outgoing relations, but only in the source space', () => {
    store.relations = [
      relation({ id: 'outgoing-source', from: ENTITY, to: 'target' }),
      relation({ id: 'outgoing-other', from: ENTITY, to: 'target', spaceId: OTHER }),
    ];

    const { relations } = collectMoveDeletions(ENTITY, SOURCE);

    expect(relations.map(r => r.id)).toEqual(['outgoing-source']);
  });

  it('deletes the entity own values, but only in the source space', () => {
    store.values = [value(ENTITY, SOURCE, 'v-source'), value(ENTITY, OTHER, 'v-other')];

    const { values } = collectMoveDeletions(ENTITY, SOURCE);

    expect(values.map(v => v.id)).toEqual(['v-source']);
  });

  // The descendant sweep carried no space filter at all, so tearing down a block deleted its data
  // in every space that held it.
  it('does not reach into other spaces when tearing down a block', () => {
    store.relations = [relation({ id: 'contains-block', from: ENTITY, to: 'block', typeId: SystemIds.BLOCKS })];
    store.values = [value('block', SOURCE, 'block-v-source'), value('block', OTHER, 'block-v-other')];

    const { values } = collectMoveDeletions(ENTITY, SOURCE);

    expect(values.map(v => v.id)).toEqual(['block-v-source']);
  });

  // A block something else still points at is shared, so the source space keeps its copy.
  it('keeps a block that another entity still references', () => {
    store.relations = [
      relation({ id: 'contains-block', from: ENTITY, to: 'block', typeId: SystemIds.BLOCKS }),
      relation({ id: 'external-ref', from: 'unrelated', to: 'block' }),
    ];
    store.values = [value('block', SOURCE, 'block-v')];

    const { values } = collectMoveDeletions(ENTITY, SOURCE);

    expect(values).toHaveLength(0);
  });
});
