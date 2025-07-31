import { CreateRelationOp, DeleteRelationOp, Id, UnsetEntityValuesOp, UpdateEntityOp } from '@graphprotocol/grc-20';
import { describe, expect, it } from 'vitest';

import { Relation, Value } from '~/core/v2.types';

import { prepareLocalDataForPublishing } from './publish';

// Helper function to create a mock Value
function createMockValue(overrides: Partial<Value> = {}): Value {
  return {
    id: Id.generate(),
    entity: {
      id: Id.generate(),
      name: 'Test Entity',
    },
    property: {
      id: Id.generate(),
      name: 'Test Property',
      dataType: 'TEXT',
    },
    value: 'test value',
    spaceId: 'test-space',
    options: null,
    timestamp: '2023-01-01T00:00:00Z',
    isDeleted: false,
    isLocal: true,
    hasBeenPublished: false,
    ...overrides,
  };
}

// Helper function to create a mock Relation
function createMockRelation(overrides: Partial<Relation> = {}): Relation {
  return {
    id: Id.generate(),
    entityId: Id.generate(),
    type: {
      id: Id.generate(),
      name: 'Test Relation Type',
    },
    fromEntity: {
      id: Id.generate(),
      name: 'From Entity',
    },
    toEntity: {
      id: Id.generate(),
      name: 'To Entity',
      value: 'to-entity-value',
    },
    renderableType: 'DATA',
    position: '1',
    verified: true,
    spaceId: 'test-space',
    timestamp: '2023-01-01T00:00:00Z',
    isDeleted: false,
    isLocal: true,
    hasBeenPublished: false,
    ...overrides,
  };
}

describe('prepareLocalDataForPublishing', () => {
  describe('basic functionality', () => {
    it('should create UPDATE_ENTITY operation for valid values', () => {
      const values = [createMockValue()];
      const relations: Relation[] = [];

      const result = prepareLocalDataForPublishing(values, relations, 'test-space');

      expect(result).toHaveLength(1);
      const updateOp = result[0] as UpdateEntityOp;
      expect(updateOp.type).toBe('UPDATE_ENTITY');
      expect(updateOp.entity.values).toHaveLength(1);
      expect(updateOp.entity.values[0].property).toBeDefined();
      expect(updateOp.entity.values[0].value).toBe('test value');
    });

    it('should create CREATE_RELATION operation for valid relations', () => {
      const values: Value[] = [];
      const relations = [createMockRelation()];

      const result = prepareLocalDataForPublishing(values, relations, 'test-space');

      expect(result).toHaveLength(1);
      const createOp = result[0] as CreateRelationOp;
      expect(createOp.type).toBe('CREATE_RELATION');
      expect(createOp.relation.id).toBeDefined();
      expect(createOp.relation.type).toBeDefined();
      expect(createOp.relation.entity).toBeDefined();
      expect(createOp.relation.fromEntity).toBeDefined();
      expect(createOp.relation.toEntity).toBeDefined();
      expect(createOp.relation.position).toBe('1');
      expect(createOp.relation.verified).toBe(true);
      expect(createOp.relation.toSpace).toBeUndefined();
    });

    it('should create DELETE_RELATION operation for deleted relations', () => {
      const values: Value[] = [];
      const relations = [createMockRelation({ isDeleted: true })];

      const result = prepareLocalDataForPublishing(values, relations, 'test-space');

      expect(result).toHaveLength(1);
      const deleteOp = result[0] as DeleteRelationOp;
      expect(deleteOp.type).toBe('DELETE_RELATION');
      expect(deleteOp.id).toBeDefined();
    });

    it('should create UNSET_ENTITY_VALUES operation for deleted values', () => {
      const values = [createMockValue({ isDeleted: true })];
      const relations: Relation[] = [];

      const result = prepareLocalDataForPublishing(values, relations, 'test-space');

      expect(result).toHaveLength(1);
      const unsetOp = result[0] as UnsetEntityValuesOp;
      expect(unsetOp.type).toBe('UNSET_ENTITY_VALUES');
      expect(unsetOp.unsetEntityValues.id).toBeDefined();
      expect(unsetOp.unsetEntityValues.properties).toHaveLength(1);
      expect(unsetOp.unsetEntityValues.properties[0]).toBeDefined();
    });
  });

  describe('filtering', () => {
    it('should filter out values from different spaces', () => {
      const values = [createMockValue({ spaceId: 'test-space' }), createMockValue({ spaceId: 'different-space' })];
      const relations: Relation[] = [];

      const result = prepareLocalDataForPublishing(values, relations, 'test-space');

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('UPDATE_ENTITY');
    });

    it('should filter out already published values', () => {
      const values = [createMockValue({ hasBeenPublished: false }), createMockValue({ hasBeenPublished: true })];
      const relations: Relation[] = [];

      const result = prepareLocalDataForPublishing(values, relations, 'test-space');

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('UPDATE_ENTITY');
    });

    it('should filter out values with empty property IDs', () => {
      const values = [
        createMockValue({ property: { id: Id.generate(), name: 'Valid', dataType: 'TEXT' } }),
        createMockValue({ property: { id: '', name: 'Invalid', dataType: 'TEXT' } }),
      ];
      const relations: Relation[] = [];

      const result = prepareLocalDataForPublishing(values, relations, 'test-space');

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('UPDATE_ENTITY');
    });

    it('should filter out values with empty entity IDs', () => {
      const values = [
        createMockValue({ entity: { id: Id.generate(), name: 'Valid' } }),
        createMockValue({ entity: { id: '', name: 'Invalid' } }),
      ];
      const relations: Relation[] = [];

      const result = prepareLocalDataForPublishing(values, relations, 'test-space');

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('UPDATE_ENTITY');
    });

    it('should filter out non-local values', () => {
      const values = [createMockValue({ isLocal: true }), createMockValue({ isLocal: false })];
      const relations: Relation[] = [];

      const result = prepareLocalDataForPublishing(values, relations, 'test-space');

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('UPDATE_ENTITY');
    });

    it('should include deleted values with empty string value', () => {
      const values = [createMockValue({ value: '', isDeleted: true })];
      const relations: Relation[] = [];

      const result = prepareLocalDataForPublishing(values, relations, 'test-space');

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('UNSET_ENTITY_VALUES');
    });
  });

  describe('value grouping and operations', () => {
    it('should group values by entity ID', () => {
      const entity1Id = Id.generate();
      const entity2Id = Id.generate();
      const values = [
        createMockValue({
          id: Id.generate(),
          entity: { id: entity1Id, name: 'Entity 1' },
          property: { id: Id.generate(), name: 'Property 1', dataType: 'TEXT' },
          value: 'value 1',
        }),
        createMockValue({
          id: Id.generate(),
          entity: { id: entity1Id, name: 'Entity 1' },
          property: { id: Id.generate(), name: 'Property 2', dataType: 'TEXT' },
          value: 'value 2',
        }),
        createMockValue({
          id: Id.generate(),
          entity: { id: entity2Id, name: 'Entity 2' },
          property: { id: Id.generate(), name: 'Property 3', dataType: 'TEXT' },
          value: 'value 3',
        }),
      ];
      const relations: Relation[] = [];

      const result = prepareLocalDataForPublishing(values, relations, 'test-space');

      expect(result).toHaveLength(2);

      const entity1Op = result.find(
        op => op.type === 'UPDATE_ENTITY' && (op as UpdateEntityOp).entity.id === entity1Id
      ) as UpdateEntityOp;

      const entity2Op = result.find(
        op => op.type === 'UPDATE_ENTITY' && (op as UpdateEntityOp).entity.id === entity2Id
      ) as UpdateEntityOp;

      expect(entity1Op.entity.values).toHaveLength(2);
      expect(entity2Op.entity.values).toHaveLength(1);
    });

    it('should create both UPDATE_ENTITY and UNSET_ENTITY_VALUES for same entity', () => {
      const entityId = Id.generate();
      const property1Id = Id.generate();
      const property2Id = Id.generate();
      const values = [
        createMockValue({
          id: Id.generate(),
          entity: { id: entityId, name: 'Entity 1' },
          property: { id: property1Id, name: 'Property 1', dataType: 'TEXT' },
          value: 'value 1',
          isDeleted: false,
        }),
        createMockValue({
          id: Id.generate(),
          entity: { id: entityId, name: 'Entity 1' },
          property: { id: property2Id, name: 'Property 2', dataType: 'TEXT' },
          value: 'value 2',
          isDeleted: true,
        }),
      ];
      const relations: Relation[] = [];

      const result = prepareLocalDataForPublishing(values, relations, 'test-space');

      expect(result).toHaveLength(2);

      const updateOp = result.find(op => op.type === 'UPDATE_ENTITY') as UpdateEntityOp;
      const unsetOp = result.find(op => op.type === 'UNSET_ENTITY_VALUES') as UnsetEntityValuesOp;

      expect(updateOp.entity.id).toBe(entityId);
      expect(updateOp.entity.values).toHaveLength(1);
      expect(updateOp.entity.values[0].property).toBe(property1Id);

      expect(unsetOp.unsetEntityValues.id).toBe(entityId);
      expect(unsetOp.unsetEntityValues.properties).toEqual([property2Id]);
    });
  });

  describe('value options handling', () => {
    it('should include value options when present', () => {
      const values = [
        createMockValue({
          options: { unit: 'kg', language: 'en' },
        }),
      ];
      const relations: Relation[] = [];

      const result = prepareLocalDataForPublishing(values, relations, 'test-space');

      const updateOp = result[0] as UpdateEntityOp;
      expect(updateOp.entity.values[0].options).toEqual({
        unit: 'kg',
        language: 'en',
      });
    });

    it('should filter out undefined option values', () => {
      const values = [
        createMockValue({
          options: { unit: 'kg', language: undefined },
        }),
      ];
      const relations: Relation[] = [];

      const result = prepareLocalDataForPublishing(values, relations, 'test-space');

      const updateOp = result[0] as UpdateEntityOp;
      expect(updateOp.entity.values[0].options).toEqual({
        unit: 'kg',
      });
    });

    it('should not include options when null', () => {
      const values = [createMockValue({ options: null })];
      const relations: Relation[] = [];

      const result = prepareLocalDataForPublishing(values, relations, 'test-space');

      const updateOp = result[0] as UpdateEntityOp;
      expect(updateOp.entity.values[0]).not.toHaveProperty('options');
    });
  });

  describe('relation handling', () => {
    it('should handle relation with toSpaceId', () => {
      const values: Value[] = [];
      const toSpaceId = Id.generate();
      const relations = [
        createMockRelation({
          toSpaceId: toSpaceId,
        }),
      ];

      const result = prepareLocalDataForPublishing(values, relations, 'test-space');

      const createOp = result[0] as CreateRelationOp;
      expect(createOp.relation.toSpace).toBe(toSpaceId);
    });

    it('should handle relation without optional fields', () => {
      const values: Value[] = [];
      const relations = [
        createMockRelation({
          position: undefined,
          verified: undefined,
          toSpaceId: undefined,
        }),
      ];

      const result = prepareLocalDataForPublishing(values, relations, 'test-space');

      const createOp = result[0] as CreateRelationOp;
      expect(createOp.relation.position).toBeUndefined();
      expect(createOp.relation.verified).toBeUndefined();
      expect(createOp.relation.toSpace).toBeUndefined();
    });
  });

  describe('mixed operations', () => {
    it('should handle mixed values and relations', () => {
      const values = [createMockValue({ isDeleted: false }), createMockValue({ isDeleted: true })];
      const relations = [createMockRelation({ isDeleted: false }), createMockRelation({ isDeleted: true })];

      const result = prepareLocalDataForPublishing(values, relations, 'test-space');

      expect(result).toHaveLength(4);
      expect(result.some(op => op.type === 'CREATE_RELATION')).toBe(true);
      expect(result.some(op => op.type === 'DELETE_RELATION')).toBe(true);
      expect(result.some(op => op.type === 'UPDATE_ENTITY')).toBe(true);
      expect(result.some(op => op.type === 'UNSET_ENTITY_VALUES')).toBe(true);
    });

    it('should return empty array when no valid values but still process all relations', () => {
      const values = [
        createMockValue({ hasBeenPublished: true }),
        createMockValue({ spaceId: 'different-space' }),
        createMockValue({ isLocal: false }),
      ];
      const relations = [
        createMockRelation({ hasBeenPublished: true }),
        createMockRelation({ spaceId: 'different-space' }),
        createMockRelation({ isLocal: false }),
      ];

      const result = prepareLocalDataForPublishing(values, relations, 'test-space');

      // Values are filtered out, but relations are processed regardless of their metadata
      expect(result).toHaveLength(3); // All 3 relations become CREATE_RELATION ops
      expect(result.every(op => op.type === 'CREATE_RELATION')).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle empty arrays', () => {
      const result = prepareLocalDataForPublishing([], [], 'test-space');
      expect(result).toHaveLength(0);
    });

    it('should maintain operation order (relations first, then entities)', () => {
      const values = [createMockValue()];
      const relations = [createMockRelation()];

      const result = prepareLocalDataForPublishing(values, relations, 'test-space');

      expect(result).toHaveLength(2);
      expect(result[0].type).toBe('CREATE_RELATION');
      expect(result[1].type).toBe('UPDATE_ENTITY');
    });
  });
});
