import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { cloneEntityIntoSpace } from './clone-entity-into-space';

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

  it('leaves the source copies in place — the clone adds, it does not move', () => {
    store.relations = [relation({ id: 'rel', from: ENTITY, to: 'related' })];
    store.values = [value('related', SOURCE, 'related-v')];

    const written = run();

    expect(written.values.every(v => v.spaceId === TARGET)).toBe(true);
    expect(store.values.find(v => v.id === 'related-v')?.spaceId).toBe(SOURCE);
  });
});
