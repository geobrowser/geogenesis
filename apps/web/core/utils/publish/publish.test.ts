import { IdUtils, Op } from '@geoprotocol/geo-sdk';
import { describe, expect, it } from 'vitest';

import { Relation, Value } from '~/core/v2.types';

import { prepareLocalDataForPublishing } from './publish';

// Helper function to create a mock Value
function createMockValue(overrides: Partial<Value> = {}): Value {
  return {
    id: IdUtils.generate(),
    entity: {
      id: IdUtils.generate(),
      name: 'Test Entity',
    },
    property: {
      id: IdUtils.generate(),
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
    id: IdUtils.generate(),
    entityId: IdUtils.generate(),
    type: {
      id: IdUtils.generate(),
      name: 'Test Relation Type',
    },
    fromEntity: {
      id: IdUtils.generate(),
      name: 'From Entity',
    },
    toEntity: {
      id: IdUtils.generate(),
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

// Type helpers for new SDK operation format
type UpdateEntityOp = Op & {
  type: 'updateEntity';
  id: unknown;
  set: Array<{ property: unknown; value: unknown }>;
  unset: Array<{ property: unknown }>;
};

type CreateRelationOp = Op & {
  type: 'createRelation';
  id: unknown;
  relationType: unknown;
  entity: unknown;
  from: unknown;
  to: unknown;
  position?: string;
  toSpace?: unknown;
};

type DeleteRelationOp = Op & {
  type: 'deleteRelation';
  id: unknown;
};

describe('prepareLocalDataForPublishing', () => {
  describe('basic functionality', () => {
    it('should create updateEntity operation for valid values', () => {
      const values = [createMockValue()];
      const relations: Relation[] = [];

      const result = prepareLocalDataForPublishing(values, relations, 'test-space');

      expect(result).toHaveLength(1);
      const updateOp = result[0] as UpdateEntityOp;
      expect(updateOp.type).toBe('updateEntity');
      expect(updateOp.set).toHaveLength(1);
      expect(updateOp.set[0].property).toBeDefined();
      expect(updateOp.set[0].value).toBeDefined();
    });

    it('should create createRelation operation for valid relations', () => {
      const values: Value[] = [];
      const relations = [createMockRelation()];

      const result = prepareLocalDataForPublishing(values, relations, 'test-space');

      expect(result).toHaveLength(1);
      const createOp = result[0] as CreateRelationOp;
      expect(createOp.type).toBe('createRelation');
      expect(createOp.id).toBeDefined();
      expect(createOp.relationType).toBeDefined();
      expect(createOp.entity).toBeDefined();
      expect(createOp.from).toBeDefined();
      expect(createOp.to).toBeDefined();
      expect(createOp.position).toBe('1');
    });

    it('should create deleteRelation operation for deleted relations', () => {
      const values: Value[] = [];
      const relations = [createMockRelation({ isDeleted: true })];

      const result = prepareLocalDataForPublishing(values, relations, 'test-space');

      expect(result).toHaveLength(1);
      const deleteOp = result[0] as DeleteRelationOp;
      expect(deleteOp.type).toBe('deleteRelation');
      expect(deleteOp.id).toBeDefined();
    });

    it('should create updateEntity operation with unset for deleted values', () => {
      const values = [createMockValue({ isDeleted: true })];
      const relations: Relation[] = [];

      const result = prepareLocalDataForPublishing(values, relations, 'test-space');

      expect(result).toHaveLength(1);
      const updateOp = result[0] as UpdateEntityOp;
      expect(updateOp.type).toBe('updateEntity');
      expect(updateOp.id).toBeDefined();
      expect(updateOp.unset).toHaveLength(1);
      expect(updateOp.unset[0].property).toBeDefined();
    });
  });

  describe('filtering', () => {
    it('should filter out values from different spaces', () => {
      const values = [createMockValue({ spaceId: 'test-space' }), createMockValue({ spaceId: 'different-space' })];
      const relations: Relation[] = [];

      const result = prepareLocalDataForPublishing(values, relations, 'test-space');

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('updateEntity');
    });

    it('should filter out already published values', () => {
      const values = [createMockValue({ hasBeenPublished: false }), createMockValue({ hasBeenPublished: true })];
      const relations: Relation[] = [];

      const result = prepareLocalDataForPublishing(values, relations, 'test-space');

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('updateEntity');
    });

    it('should filter out values with empty property IDs', () => {
      const values = [
        createMockValue({ property: { id: IdUtils.generate(), name: 'Valid', dataType: 'TEXT' } }),
        createMockValue({ property: { id: '', name: 'Invalid', dataType: 'TEXT' } }),
      ];
      const relations: Relation[] = [];

      const result = prepareLocalDataForPublishing(values, relations, 'test-space');

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('updateEntity');
    });

    it('should filter out values with empty entity IDs', () => {
      const values = [
        createMockValue({ entity: { id: IdUtils.generate(), name: 'Valid' } }),
        createMockValue({ entity: { id: '', name: 'Invalid' } }),
      ];
      const relations: Relation[] = [];

      const result = prepareLocalDataForPublishing(values, relations, 'test-space');

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('updateEntity');
    });

    it('should filter out non-local values', () => {
      const values = [createMockValue({ isLocal: true }), createMockValue({ isLocal: false })];
      const relations: Relation[] = [];

      const result = prepareLocalDataForPublishing(values, relations, 'test-space');

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('updateEntity');
    });

    it('should include deleted values with empty string value', () => {
      const values = [createMockValue({ value: '', isDeleted: true })];
      const relations: Relation[] = [];

      const result = prepareLocalDataForPublishing(values, relations, 'test-space');

      expect(result).toHaveLength(1);
      const updateOp = result[0] as UpdateEntityOp;
      expect(updateOp.type).toBe('updateEntity');
      expect(updateOp.unset.length).toBeGreaterThan(0);
    });
  });

  describe('value grouping and operations', () => {
    it('should group values by entity ID', () => {
      const entity1Id = IdUtils.generate();
      const entity2Id = IdUtils.generate();
      const values = [
        createMockValue({
          id: IdUtils.generate(),
          entity: { id: entity1Id, name: 'Entity 1' },
          property: { id: IdUtils.generate(), name: 'Property 1', dataType: 'TEXT' },
          value: 'value 1',
        }),
        createMockValue({
          id: IdUtils.generate(),
          entity: { id: entity1Id, name: 'Entity 1' },
          property: { id: IdUtils.generate(), name: 'Property 2', dataType: 'TEXT' },
          value: 'value 2',
        }),
        createMockValue({
          id: IdUtils.generate(),
          entity: { id: entity2Id, name: 'Entity 2' },
          property: { id: IdUtils.generate(), name: 'Property 3', dataType: 'TEXT' },
          value: 'value 3',
        }),
      ];
      const relations: Relation[] = [];

      const result = prepareLocalDataForPublishing(values, relations, 'test-space');

      expect(result).toHaveLength(2);

      const ops = result as UpdateEntityOp[];
      const entity1Op = ops.find(op => String(op.id) === entity1Id);
      const entity2Op = ops.find(op => String(op.id) === entity2Id);

      expect(entity1Op?.set).toHaveLength(2);
      expect(entity2Op?.set).toHaveLength(1);
    });

    it('should create updateEntity with both set and unset for same entity', () => {
      const entityId = IdUtils.generate();
      const property1Id = IdUtils.generate();
      const property2Id = IdUtils.generate();
      const values = [
        createMockValue({
          id: IdUtils.generate(),
          entity: { id: entityId, name: 'Entity 1' },
          property: { id: property1Id, name: 'Property 1', dataType: 'TEXT' },
          value: 'value 1',
          isDeleted: false,
        }),
        createMockValue({
          id: IdUtils.generate(),
          entity: { id: entityId, name: 'Entity 1' },
          property: { id: property2Id, name: 'Property 2', dataType: 'TEXT' },
          value: 'value 2',
          isDeleted: true,
        }),
      ];
      const relations: Relation[] = [];

      const result = prepareLocalDataForPublishing(values, relations, 'test-space');

      expect(result).toHaveLength(1);

      const updateOp = result[0] as UpdateEntityOp;
      expect(updateOp.type).toBe('updateEntity');
      expect(String(updateOp.id)).toBe(entityId);
      expect(updateOp.set).toHaveLength(1);
      expect(updateOp.unset).toHaveLength(1);
    });
  });

  describe('relation handling', () => {
    it('should handle relation with toSpaceId', () => {
      const values: Value[] = [];
      const toSpaceId = IdUtils.generate();
      const relations = [
        createMockRelation({
          toSpaceId: toSpaceId,
        }),
      ];

      const result = prepareLocalDataForPublishing(values, relations, 'test-space');

      const createOp = result[0] as CreateRelationOp;
      expect(createOp.toSpace).toBeDefined();
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
      expect(createOp.position).toBeUndefined();
      expect(createOp.toSpace).toBeUndefined();
    });
  });

  describe('mixed operations', () => {
    it('should handle mixed values and relations', () => {
      const values = [createMockValue({ isDeleted: false }), createMockValue({ isDeleted: true })];
      const relations = [createMockRelation({ isDeleted: false }), createMockRelation({ isDeleted: true })];

      const result = prepareLocalDataForPublishing(values, relations, 'test-space');

      expect(result).toHaveLength(4);
      expect(result.some(op => op.type === 'createRelation')).toBe(true);
      expect(result.some(op => op.type === 'deleteRelation')).toBe(true);
      expect(result.some(op => op.type === 'updateEntity')).toBe(true);
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
      expect(result).toHaveLength(3); // All 3 relations become createRelation ops
      expect(result.every(op => op.type === 'createRelation')).toBe(true);
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
      expect(result[0].type).toBe('createRelation');
      expect(result[1].type).toBe('updateEntity');
    });
  });
});
