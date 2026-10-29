import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { cloneEntityIntoSpace, collectHydrationTargetIds } from './clone-entity-into-space';

const store = vi.hoisted(() => ({ relations: [] as any[], values: [] as any[] }));

const withMerged = (rows: any[], mergeWith: any[] = []) => [
  ...rows,
  ...mergeWith.filter(m => !rows.some(r => r.id === m.id)),
];

vi.mock('~/core/sync/use-store', () => ({
  getRelations: ({ selector, mergeWith }: { selector?: (r: any) => boolean; mergeWith?: any[] }) =>
    withMerged(store.relations, mergeWith).filter(r => (selector ? selector(r) : true)),
  getValues: ({ selector, mergeWith }: { selector?: (v: any) => boolean; mergeWith?: any[] }) =>
    withMerged(store.values, mergeWith).filter(v => (selector ? selector(v) : true)),
}));

const SOURCE = 'space-source';
const TARGET = 'space-target';
const ENTITY = 'entity-moved';

const relation = (o: Record<string, any>) => ({
  id: o.id,
  entityId: o.id,
  spaceId: o.spaceId ?? SOURCE,
  renderableType: o.renderableType ?? 'RELATION',
  type: { id: o.typeId ?? 'ordinary-property', name: null },
  fromEntity: { id: o.from, name: null },
  toEntity: { id: o.to, name: null, value: o.to },
  toSpaceId: o.toSpaceId,
});

const value = (entityId: string, spaceId: string, id: string) => ({
  id,
  entity: { id: entityId },
  property: { id: `prop-${id}` },
  spaceId,
  value: 'x',
});

function run(loaded: any[] = []) {
  const written = { values: [] as any[], relations: [] as any[] };
  const storage = {
    values: { set: (v: any) => written.values.push(v) },
    relations: { set: (r: any) => written.relations.push(r) },
  } as any;
  cloneEntityIntoSpace(ENTITY, SOURCE, TARGET, storage, loaded);
  return written;
}

beforeEach(() => {
  store.relations = [];
  store.values = [];
});

describe('cloneEntityIntoSpace — related entities', () => {
  it('does not copy a related entity values or types', () => {
    store.relations = [
      relation({ id: 'rel', from: ENTITY, to: 'related' }),
      relation({ id: 'related-type', from: 'related', to: 'some-type', typeId: SystemIds.TYPES_PROPERTY }),
    ];
    store.values = [value('related', SOURCE, 'related-v')];

    const written = run();

    expect(written.values.some(v => v.entity.id === 'related')).toBe(false);
    expect(written.relations.some(r => r.fromEntity.id === 'related')).toBe(false);
  });

  it('points the copied link at the source space, where the related entity data is', () => {
    store.relations = [relation({ id: 'rel', from: ENTITY, to: 'related' })];

    const copied = run().relations.find(r => r.toEntity.id === 'related');

    expect(copied?.spaceId).toBe(TARGET);
    expect(copied?.toSpaceId).toBe(SOURCE);
  });

  it('pins a link from a block to a related entity too', () => {
    store.relations = [
      relation({ id: 'contains-block', from: ENTITY, to: 'block', typeId: SystemIds.BLOCKS }),
      relation({ id: 'block-rel', from: 'block', to: 'related' }),
    ];

    expect(run().relations.find(r => r.toEntity.id === 'related')?.toSpaceId).toBe(SOURCE);
  });

  it('keeps a space the link already names', () => {
    store.relations = [relation({ id: 'rel', from: ENTITY, to: 'related', toSpaceId: 'space-elsewhere' })];

    expect(run().relations.find(r => r.toEntity.id === 'related')?.toSpaceId).toBe('space-elsewhere');
  });

  it('leaves a link to a copied block unpinned, so it resolves to the copy', () => {
    store.relations = [relation({ id: 'contains-block', from: ENTITY, to: 'block', typeId: SystemIds.BLOCKS })];

    expect(run().relations.find(r => r.toEntity.id === 'block')?.toSpaceId).toBeUndefined();
  });

  it('leaves a link to copied media unpinned', () => {
    store.relations = [relation({ id: 'cover', from: ENTITY, to: 'an-image', renderableType: 'IMAGE' })];

    expect(run().relations.find(r => r.toEntity.id === 'an-image')?.toSpaceId).toBeUndefined();
  });

  it('does not write the pinned link again over one an earlier clone wrote', () => {
    store.relations = [
      relation({ id: 'rel', from: ENTITY, to: 'related' }),
      relation({ id: 'pinned-copy', from: ENTITY, to: 'related', spaceId: TARGET, toSpaceId: SOURCE }),
    ];

    expect(run().relations.some(r => r.toEntity.id === 'related')).toBe(false);
  });

  it('does not write the pinned link next to an unpinned copy of it', () => {
    store.relations = [
      relation({ id: 'rel', from: ENTITY, to: 'related' }),
      relation({ id: 'unpinned-copy', from: ENTITY, to: 'related', spaceId: TARGET }),
    ];

    expect(run().relations.some(r => r.toEntity.id === 'related')).toBe(false);
  });
});

describe('collectHydrationTargetIds', () => {
  const unloaded = () => collectHydrationTargetIds(ENTITY, SOURCE);

  it('names the media entity behind an image property', () => {
    store.relations = [relation({ id: 'rel', from: ENTITY, to: 'an-image', renderableType: 'IMAGE' })];

    expect(unloaded()).toEqual(['an-image']);
  });

  it('leaves out related entities, the subtree and shared ontology, none of which is copied from a fetch', () => {
    store.relations = [
      relation({ id: 'rel', from: ENTITY, to: 'never-opened' }),
      relation({ id: 'block-rel', from: ENTITY, to: 'a-block', typeId: SystemIds.BLOCKS }),
      relation({ id: 'ontology-rel', from: ENTITY, to: SystemIds.PERSON_TYPE }),
    ];

    expect(unloaded()).toEqual([]);
  });

  it('copies a fetched media entity the store has not taken in yet', () => {
    store.relations = [relation({ id: 'cover', from: ENTITY, to: 'an-image', renderableType: 'IMAGE' })];
    const fetched = {
      id: 'an-image',
      values: [value('an-image', SOURCE, 'fetched-v')],
      relations: [
        relation({ id: 'fetched-type', from: 'an-image', to: SystemIds.IMAGE_TYPE, typeId: SystemIds.TYPES_PROPERTY }),
      ],
    };

    const written = run([fetched]);

    expect(written.values.map(v => v.entity.id)).toContain('an-image');
    expect(written.relations.some(r => r.fromEntity.id === 'an-image' && r.toEntity.id === SystemIds.IMAGE_TYPE)).toBe(
      true
    );
  });
});
