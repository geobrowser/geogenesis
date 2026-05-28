import { SystemIds } from '@geoprotocol/geo-sdk';

import { Effect } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PROPERTY_GROUPS_PROPERTY } from '../constants';
import { Entity, Property, Relation } from '../types';
import { getSchemaWithGroupsFromTypeIdsAndRelations } from './entities';

const mocks = vi.hoisted(() => ({
  entitiesById: new Map<string, Entity>(),
  propertiesById: new Map<string, Property>(),
  findMany: vi.fn(),
  getProperties: vi.fn(),
}));

vi.mock('../sync/orm', () => ({
  E: {
    findMany: mocks.findMany,
  },
}));

vi.mock('../io/queries', () => ({
  getProperties: mocks.getProperties,
}));

vi.mock('../sync/use-sync-engine', () => ({
  store: {},
}));

vi.mock('../query-client', () => ({
  queryClient: {},
}));

const spaceId = 'space-1';

function property(id: string, name: string, options: Partial<Property> = {}): Property {
  return {
    id,
    name,
    dataType: 'TEXT',
    ...options,
  };
}

function entity(id: string, name: string, relations: Relation[] = [], spaces: string[] = [spaceId]): Entity {
  return {
    id,
    name,
    description: null,
    spaces,
    types: [],
    values: [],
    relations,
  };
}

function relation(params: {
  id: string;
  from: string;
  type: string;
  to: string;
  toName?: string | null;
  position?: string | null;
  spaceId?: string;
}): Relation {
  return {
    id: params.id,
    entityId: `${params.id}-entity`,
    type: { id: params.type, name: params.type },
    fromEntity: { id: params.from, name: params.from },
    toEntity: { id: params.to, name: params.toName ?? params.to, value: params.to },
    renderableType: 'RELATION',
    position: params.position ?? '1',
    verified: false,
    spaceId: params.spaceId ?? spaceId,
  };
}

describe('getSchemaWithGroupsFromTypeIdsAndRelations', () => {
  beforeEach(() => {
    mocks.entitiesById.clear();
    mocks.propertiesById.clear();
    mocks.findMany.mockReset();
    mocks.getProperties.mockReset();

    mocks.findMany.mockImplementation(async ({ where }: { where: { id?: { in?: string[] } } }) => {
      const ids = where.id?.in ?? [];
      return ids.map(id => mocks.entitiesById.get(id)).filter((item): item is Entity => item != null);
    });

    mocks.getProperties.mockImplementation((ids: string[]) =>
      Effect.succeed(ids.map(id => mocks.propertiesById.get(id)).filter((item): item is Property => item != null))
    );
  });

  it('keeps type properties ungrouped when only group relations are removed', async () => {
    mocks.propertiesById.set('property-a', property('property-a', 'Property A'));
    mocks.propertiesById.set('property-b', property('property-b', 'Property B'));
    mocks.entitiesById.set(
      'type',
      entity('type', 'Type', [
        relation({ id: 'type-property-a', from: 'type', type: SystemIds.PROPERTIES, to: 'property-a', position: '1' }),
        relation({ id: 'type-property-b', from: 'type', type: SystemIds.PROPERTIES, to: 'property-b', position: '2' }),
      ])
    );

    const result = await getSchemaWithGroupsFromTypeIdsAndRelations([{ id: 'type', spaceId }], []);

    expect(result.propertyGroups).toEqual([]);
    expect(result.ungroupedPropertyIds).toEqual(['property-a', 'property-b']);
    expect(result.hasPropertyGroups).toBe(false);
  });

  it('keeps isType properties flat when there are no explicit property groups', async () => {
    mocks.propertiesById.set(
      'is-type-property',
      property('is-type-property', 'Is type property', { dataType: 'RELATION', isType: true })
    );
    mocks.propertiesById.set('target-property', property('target-property', 'Target property'));
    mocks.entitiesById.set(
      'type',
      entity('type', 'Type', [
        relation({ id: 'type-is-type-property', from: 'type', type: SystemIds.PROPERTIES, to: 'is-type-property' }),
      ])
    );
    mocks.entitiesById.set(
      'target',
      entity('target', 'Target type', [
        relation({ id: 'target-property-relation', from: 'target', type: SystemIds.PROPERTIES, to: 'target-property' }),
      ])
    );

    const result = await getSchemaWithGroupsFromTypeIdsAndRelations(
      [{ id: 'type', spaceId }],
      [
        relation({
          id: 'entity-is-type-relation',
          from: 'entity',
          type: 'is-type-property',
          to: 'target',
          toName: 'Target type',
        }),
      ]
    );

    expect(result.propertyGroups).toEqual([]);
    expect(result.ungroupedPropertyIds).toEqual(['is-type-property', 'target-property']);
    expect(result.hasPropertyGroups).toBe(false);
    expect(result.schema.map(item => item.id)).toContain('target-property');
  });

  it('does not render an isType group when the target entity has no properties', async () => {
    mocks.propertiesById.set(
      'is-type-property',
      property('is-type-property', 'Is type property', { dataType: 'RELATION', isType: true })
    );
    mocks.entitiesById.set(
      'type',
      entity('type', 'Type', [
        relation({ id: 'type-is-type-property', from: 'type', type: SystemIds.PROPERTIES, to: 'is-type-property' }),
      ])
    );
    mocks.entitiesById.set('target', entity('target', 'Target type'));

    const result = await getSchemaWithGroupsFromTypeIdsAndRelations(
      [{ id: 'type', spaceId }],
      [
        relation({
          id: 'entity-is-type-relation',
          from: 'entity',
          type: 'is-type-property',
          to: 'target',
          toName: 'Target type',
        }),
      ]
    );

    expect(result.propertyGroups).toEqual([]);
    expect(result.ungroupedPropertyIds).toEqual(['is-type-property']);
    expect(result.hasPropertyGroups).toBe(false);
  });

  it('places isType groups directly after the explicit group containing the triggering property', async () => {
    mocks.propertiesById.set(
      'is-type-property',
      property('is-type-property', 'Is type property', { dataType: 'RELATION', isType: true })
    );
    mocks.propertiesById.set('other-property', property('other-property', 'Other property'));
    mocks.propertiesById.set('target-property', property('target-property', 'Target property'));
    mocks.entitiesById.set(
      'type',
      entity('type', 'Type', [
        relation({
          id: 'type-is-type-property',
          from: 'type',
          type: SystemIds.PROPERTIES,
          to: 'is-type-property',
          position: '1',
        }),
        relation({
          id: 'type-other-property',
          from: 'type',
          type: SystemIds.PROPERTIES,
          to: 'other-property',
          position: '2',
        }),
        relation({ id: 'type-group', from: 'type', type: PROPERTY_GROUPS_PROPERTY, to: 'group', toName: 'Main group' }),
      ])
    );
    mocks.entitiesById.set(
      'group',
      entity('group', 'Main group', [
        relation({ id: 'group-is-type-property', from: 'group', type: SystemIds.PROPERTIES, to: 'is-type-property' }),
      ])
    );
    mocks.entitiesById.set(
      'target',
      entity('target', 'Target type', [
        relation({ id: 'target-property-relation', from: 'target', type: SystemIds.PROPERTIES, to: 'target-property' }),
      ])
    );

    const result = await getSchemaWithGroupsFromTypeIdsAndRelations(
      [{ id: 'type', spaceId }],
      [
        relation({
          id: 'entity-is-type-relation',
          from: 'entity',
          type: 'is-type-property',
          to: 'target',
          toName: 'Target type',
        }),
      ]
    );

    expect(result.propertyGroups.map(group => group.id)).toEqual(['group', 'is-type-entity-is-type-relation']);
    expect(result.propertyGroups[0]).toMatchObject({
      id: 'group',
      name: 'Main group',
      propertyIds: ['is-type-property'],
      source: 'type',
    });
    expect(result.propertyGroups[1]).toMatchObject({
      id: 'is-type-entity-is-type-relation',
      name: 'Target type',
      propertyIds: ['target-property'],
      source: 'isType',
    });
    expect(result.ungroupedPropertyIds).toEqual(['other-property']);
  });

  it('resolves isType targets through their top-ranked space when no toSpace is defined', async () => {
    const roleSpaceId = 'role-space';
    const entitiesByIdAndSpace = new Map<string, Entity>();
    mocks.findMany.mockImplementation(
      async ({ where, spaceId: fetchedSpaceId }: { where: { id?: { in?: string[] } }; spaceId?: string }) => {
        const ids = where.id?.in ?? [];
        return ids
          .map(id => entitiesByIdAndSpace.get(`${id}:${fetchedSpaceId ?? ''}`) ?? entitiesByIdAndSpace.get(`${id}:`))
          .filter((item): item is Entity => item != null);
      }
    );

    mocks.propertiesById.set(
      'roles-property',
      property('roles-property', 'Roles', { dataType: 'RELATION', isType: true })
    );
    mocks.propertiesById.set('related-projects', property('related-projects', 'Related projects'));
    mocks.entitiesById.set(
      'type',
      entity('type', 'Type', [
        relation({ id: 'type-roles-property', from: 'type', type: SystemIds.PROPERTIES, to: 'roles-property' }),
      ])
    );
    entitiesByIdAndSpace.set(
      'type:space-1',
      entity('type', 'Type', [
        relation({ id: 'type-roles-property', from: 'type', type: SystemIds.PROPERTIES, to: 'roles-property' }),
      ])
    );
    entitiesByIdAndSpace.set(
      'product-lead:space-1',
      entity(
        'product-lead',
        'Product lead',
        [relation({ id: 'role-kind', from: 'product-lead', type: SystemIds.TYPES_PROPERTY, to: 'role', spaceId })],
        [roleSpaceId, spaceId]
      )
    );
    entitiesByIdAndSpace.set(
      'product-lead:',
      entity(
        'product-lead',
        'Product lead',
        [
          relation({
            id: 'related-projects-relation',
            from: 'product-lead',
            type: SystemIds.PROPERTIES,
            to: 'related-projects',
            spaceId: roleSpaceId,
          }),
        ],
        [roleSpaceId, spaceId]
      )
    );

    const result = await getSchemaWithGroupsFromTypeIdsAndRelations(
      [{ id: 'type', spaceId }],
      [
        relation({
          id: 'entity-role-relation',
          from: 'entity',
          type: 'roles-property',
          to: 'product-lead',
          toName: 'Product lead',
        }),
      ]
    );

    expect(result.propertyGroups).toEqual([]);
    expect(result.ungroupedPropertyIds).toEqual(['roles-property', 'related-projects']);
    expect(result.hasPropertyGroups).toBe(false);
    expect(result.schema.map(item => item.id)).toContain('related-projects');
  });
});
