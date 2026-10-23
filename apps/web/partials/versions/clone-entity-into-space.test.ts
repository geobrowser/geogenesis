import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { cloneEntityIntoSpace, collectHydrationTargetIds } from './clone-entity-into-space';

const store = vi.hoisted(() => ({ relations: [] as any[], values: [] as any[] }));

vi.mock('~/core/sync/use-store', () => ({
  getRelations: ({ selector }: { selector?: (r: any) => boolean }) =>
    store.relations.filter(r => (selector ? selector(r) : true)),
  getValues: ({ selector }: { selector?: (v: any) => boolean }) =>
    store.values.filter(v => (selector ? selector(v) : true)),
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
});

const value = (entityId: string, spaceId: string, id: string) => ({
  id,
  entity: { id: entityId },
  property: { id: `prop-${id}` },
  spaceId,
  value: 'x',
});

function run() {
  const written = { values: [] as any[], relations: [] as any[] };
  const storage = {
    values: { set: (v: any) => written.values.push(v) },
    relations: { set: (r: any) => written.relations.push(r) },
  } as any;
  cloneEntityIntoSpace(ENTITY, SOURCE, TARGET, storage);
  return written;
}

beforeEach(() => {
  store.relations = [];
  store.values = [];
});

describe('cloneEntityIntoSpace — related entities', () => {
  // The reported bug: the relation came across, its target did not, so following the link in the
  // destination landed on an entity with no data there.
  it('copies a related entity own values into the destination', () => {
    store.relations = [relation({ id: 'rel', from: ENTITY, to: 'related' })];
    store.values = [value('related', SOURCE, 'related-v')];

    const written = run();

    expect(written.values.some(v => v.entity.id === 'related' && v.spaceId === TARGET)).toBe(true);
  });

  it('copies a related entity types so the destination renders it as what it is', () => {
    store.relations = [
      relation({ id: 'rel', from: ENTITY, to: 'related' }),
      relation({ id: 'related-type', from: 'related', to: 'some-type', typeId: SystemIds.TYPES_PROPERTY }),
    ];

    const written = run();

    expect(written.relations.some(r => r.fromEntity.id === 'related' && r.spaceId === TARGET)).toBe(true);
  });

  // One level. Copying a related entity's other relations would pull its neighbours in behind it.
  it('does not copy a related entity other outgoing relations', () => {
    store.relations = [
      relation({ id: 'rel', from: ENTITY, to: 'related' }),
      relation({ id: 'related-onward', from: 'related', to: 'second-degree' }),
    ];
    store.values = [value('second-degree', SOURCE, 'second-v')];

    const written = run();

    expect(
      written.relations.some(r => r.id && r.fromEntity.id === 'related' && r.toEntity.id === 'second-degree')
    ).toBe(false);
    expect(written.values.some(v => v.entity.id === 'second-degree')).toBe(false);
  });

  it('never copies shared ontology, however it is referenced', () => {
    store.relations = [relation({ id: 'rel', from: ENTITY, to: SystemIds.PERSON_TYPE })];
    store.values = [value(SystemIds.PERSON_TYPE, SOURCE, 'system-v')];

    const written = run();

    expect(written.values.some(v => v.entity.id === SystemIds.PERSON_TYPE)).toBe(false);
  });

  it('never copies a person', () => {
    store.relations = [
      relation({ id: 'rel', from: ENTITY, to: 'a-person' }),
      relation({ id: 'person-type', from: 'a-person', to: SystemIds.PERSON_TYPE, typeId: SystemIds.TYPES_PROPERTY }),
    ];
    store.values = [value('a-person', SOURCE, 'person-v')];

    const written = run();

    expect(written.values.some(v => v.entity.id === 'a-person')).toBe(false);
  });

  // A plain space carries only SPACE_TYPE, not one of the specialized space types, so before the
  // fix it slipped past the never-copied check and was duplicated like ordinary content.
  it('never copies a plain space', () => {
    store.relations = [
      relation({ id: 'rel', from: ENTITY, to: 'a-space' }),
      relation({ id: 'space-type', from: 'a-space', to: SystemIds.SPACE_TYPE, typeId: SystemIds.TYPES_PROPERTY }),
    ];
    store.values = [value('a-space', SOURCE, 'space-v')];

    const written = run();

    expect(written.values.some(v => v.entity.id === 'a-space')).toBe(false);
    expect(written.relations.some(r => r.fromEntity.id === 'a-space')).toBe(false);
  });

  it('never copies a custom type (Types → SCHEMA_TYPE)', () => {
    store.relations = [
      relation({ id: 'rel', from: ENTITY, to: 'custom-type' }),
      relation({ id: 'type-type', from: 'custom-type', to: SystemIds.SCHEMA_TYPE, typeId: SystemIds.TYPES_PROPERTY }),
      relation({ id: 'type-props', from: 'custom-type', to: 'a-property', typeId: SystemIds.PROPERTIES }),
    ];
    store.values = [value('custom-type', SOURCE, 'type-v')];

    const written = run();

    expect(written.values.some(v => v.entity.id === 'custom-type')).toBe(false);
    expect(written.relations.some(r => r.fromEntity.id === 'custom-type')).toBe(false);
  });

  it('never copies a custom property (Types → PROPERTY)', () => {
    store.relations = [
      relation({ id: 'rel', from: ENTITY, to: 'custom-property' }),
      relation({
        id: 'property-type',
        from: 'custom-property',
        to: SystemIds.PROPERTY,
        typeId: SystemIds.TYPES_PROPERTY,
      }),
    ];
    store.values = [value('custom-property', SOURCE, 'property-v')];

    const written = run();

    expect(written.values.some(v => v.entity.id === 'custom-property')).toBe(false);
    expect(written.relations.some(r => r.fromEntity.id === 'custom-property')).toBe(false);
  });

  it('never copies a person whose type is recorded in their own space', () => {
    store.relations = [
      relation({ id: 'rel', from: ENTITY, to: 'a-person' }),
      relation({
        id: 'person-type',
        from: 'a-person',
        to: SystemIds.PERSON_TYPE,
        typeId: SystemIds.TYPES_PROPERTY,
        spaceId: 'their-own-profile-space',
      }),
    ];
    store.values = [value('a-person', SOURCE, 'person-v')];

    const written = run();

    expect(written.values.some(v => v.entity.id === 'a-person')).toBe(false);
  });

  it('never copies a property defined in the space that declared it', () => {
    store.relations = [
      relation({ id: 'rel', from: ENTITY, to: 'a-property' }),
      relation({
        id: 'property-type',
        from: 'a-property',
        to: SystemIds.PROPERTY,
        typeId: SystemIds.TYPES_PROPERTY,
        spaceId: 'the-space-that-declared-it',
      }),
    ];
    store.values = [value('a-property', SOURCE, 'property-v')];

    const written = run();

    expect(written.values.some(v => v.entity.id === 'a-property')).toBe(false);
  });

  it('copies a related entity’s source-space values only', () => {
    store.relations = [relation({ id: 'rel', from: ENTITY, to: 'related' })];
    store.values = [value('related', SOURCE, 'here-v'), value('related', 'somewhere-else', 'elsewhere-v')];

    const written = run();

    const forRelated = written.values.filter(v => v.entity.id === 'related');
    expect(forRelated).toHaveLength(1);
    expect(forRelated[0]?.property.id).toBe('prop-here-v');
  });

  it('leaves the source copies in place — the clone adds, it does not move', () => {
    store.relations = [relation({ id: 'rel', from: ENTITY, to: 'related' })];
    store.values = [value('related', SOURCE, 'related-v')];

    const written = run();

    expect(written.values.every(v => v.spaceId === TARGET)).toBe(true);
    expect(store.values.find(v => v.id === 'related-v')?.spaceId).toBe(SOURCE);
  });
});

describe('collectHydrationTargetIds', () => {
  const unloaded = () => collectHydrationTargetIds(ENTITY, SOURCE);

  it('names a related target that has nothing in the store yet', () => {
    store.relations = [relation({ id: 'rel', from: ENTITY, to: 'never-opened' })];

    expect(unloaded()).toEqual(['never-opened']);
  });

  it('names a target the exclusions would drop once it is loaded', () => {
    store.relations = [
      relation({ id: 'rel', from: ENTITY, to: 'a-person' }),
      relation({
        id: 'person-type',
        from: 'a-person',
        to: SystemIds.PERSON_TYPE,
        typeId: SystemIds.TYPES_PROPERTY,
        spaceId: 'their-own-profile-space',
      }),
    ];

    expect(unloaded()).toContain('a-person');
  });

  it('names the media entity behind an image property', () => {
    store.relations = [relation({ id: 'rel', from: ENTITY, to: 'an-image', renderableType: 'IMAGE' })];

    expect(unloaded()).toEqual(['an-image']);
  });

  it('leaves out the subtree and shared ontology, which need no fetching', () => {
    store.relations = [
      relation({ id: 'block-rel', from: ENTITY, to: 'a-block', typeId: SystemIds.BLOCKS }),
      relation({ id: 'ontology-rel', from: ENTITY, to: SystemIds.PERSON_TYPE }),
    ];

    expect(unloaded()).toEqual([]);
  });

  it('copies nothing for an unloaded target, and its values once the fetch has landed', () => {
    store.relations = [relation({ id: 'rel', from: ENTITY, to: 'never-opened' })];

    expect(run().values.some(v => v.entity.id === 'never-opened')).toBe(false);

    store.values = [value('never-opened', SOURCE, 'fetched-v')];

    expect(run().values.some(v => v.entity.id === 'never-opened')).toBe(true);
  });
});
