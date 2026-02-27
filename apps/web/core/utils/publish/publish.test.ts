import { IdUtils, Op } from '@geoprotocol/geo-sdk';
import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';

import { Relation, Value } from '~/core/types';

import { Publish, prepareLocalDataForPublishing as prepareLocalDataForPublishingEffect } from './publish';

/** Unwrap the Effect for test assertions */
function prepareLocalDataForPublishing(values: Value[], relations: Relation[], spaceId: string): Op[] {
  return Effect.runSync(prepareLocalDataForPublishingEffect(values, relations, spaceId));
}

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
      expect(result.every(op => op.type === 'updateEntity')).toBe(true);

      const ops = result as UpdateEntityOp[];
      const setCounts = ops.map(op => op.set?.length ?? 0).sort();
      expect(setCounts).toEqual([1, 2]);
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
      expect(updateOp.id).toBeDefined();
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

    it('should skip values with RELATION data type instead of throwing', () => {
      const entityId = IdUtils.generate();
      const values = [
        createMockValue({
          entity: { id: entityId, name: 'Entity' },
          property: { id: IdUtils.generate(), name: 'Some Relation', dataType: 'RELATION' },
          value: '',
        }),
        createMockValue({
          entity: { id: entityId, name: 'Entity' },
          property: { id: IdUtils.generate(), name: 'Name', dataType: 'TEXT' },
          value: 'hello',
        }),
      ];
      const relations: Relation[] = [];

      const result = prepareLocalDataForPublishing(values, relations, 'test-space');

      expect(result).toHaveLength(1);
      const updateOp = result[0] as UpdateEntityOp;
      expect(updateOp.type).toBe('updateEntity');
      expect(updateOp.set).toHaveLength(1);
    });

    it('should skip deleted values with RELATION data type instead of unsetting them', () => {
      const values = [
        createMockValue({
          property: { id: IdUtils.generate(), name: 'Some Relation', dataType: 'RELATION' },
          isDeleted: true,
        }),
      ];
      const relations: Relation[] = [];

      const result = prepareLocalDataForPublishing(values, relations, 'test-space');

      expect(result).toHaveLength(0);
    });
  });
});

describe('toRfc3339Date', () => {
  const toRfc3339Date = Publish.toRfc3339Date;

  it('should convert a full ISO string to date-only', () => {
    expect(toRfc3339Date('2024-01-15T14:30:00.000Z')).toBe('2024-01-15');
  });

  it('should pass through an already-correct date-only string', () => {
    expect(toRfc3339Date('2024-07-04')).toBe('2024-07-04');
  });

  it('should handle ISO string with timezone offset', () => {
    expect(toRfc3339Date('2024-12-31T23:00:00.000+00:00')).toBe('2024-12-31');
  });

  it('should extract date from a time-only string (epoch date)', () => {
    expect(toRfc3339Date('14:30:00Z')).toBe('1970-01-01');
  });
});

describe('toRfc3339Time', () => {
  const toRfc3339Time = Publish.toRfc3339Time;

  it('should convert a full ISO string to time-only', () => {
    expect(toRfc3339Time('2024-01-15T14:30:00.000Z')).toBe('14:30:00Z');
  });

  it('should convert a full ISO string with midnight', () => {
    expect(toRfc3339Time('2024-01-15T00:00:00.000Z')).toBe('00:00:00Z');
  });

  it('should pass through an already-correct time-only string', () => {
    expect(toRfc3339Time('14:30:00Z')).toBe('14:30:00Z');
  });

  it('should handle time extracted from a date-only string (midnight)', () => {
    expect(toRfc3339Time('2024-07-04')).toBe('00:00:00Z');
  });
});

describe('toRfc3339Datetime', () => {
  const toRfc3339Datetime = Publish.toRfc3339Datetime;

  it('should convert a full ISO string to RFC 3339 datetime', () => {
    expect(toRfc3339Datetime('2024-01-15T14:30:00.000Z')).toBe('2024-01-15T14:30:00Z');
  });

  it('should convert a date-only string to datetime at midnight', () => {
    expect(toRfc3339Datetime('2024-07-04')).toBe('2024-07-04T00:00:00Z');
  });

  it('should convert a time-only string to datetime on epoch date', () => {
    expect(toRfc3339Datetime('14:30:00Z')).toBe('1970-01-01T14:30:00Z');
  });

  it('should strip milliseconds from full ISO string', () => {
    expect(toRfc3339Datetime('2024-06-15T09:45:30.123Z')).toBe('2024-06-15T09:45:30Z');
  });

  it('should produce exactly one trailing Z', () => {
    const result = toRfc3339Datetime('2024-01-15T14:30:00.000Z');
    expect(result).toBe('2024-01-15T14:30:00Z');
    expect(result.endsWith('ZZ')).toBe(false);
  });
});

describe('date/time publish round-trip', () => {
  it('should produce SDK-compatible DATE value from stored ISO string', () => {
    const entityId = IdUtils.generate();
    const propertyId = IdUtils.generate();
    const values = [
      createMockValue({
        entity: { id: entityId, name: 'Entity' },
        property: { id: propertyId, name: 'Birthday', dataType: 'DATE' },
        value: '2024-01-15T00:00:00.000Z',
      }),
    ];

    const result = prepareLocalDataForPublishing(values, [], 'test-space');
    const updateOp = result[0] as UpdateEntityOp;
    const setValue = updateOp.set[0].value as { type: string; value: string };
    expect(setValue.type).toBe('date');
    expect(setValue.value).toBe('2024-01-15');
  });

  it('should produce SDK-compatible TIME value from stored ISO string', () => {
    const entityId = IdUtils.generate();
    const propertyId = IdUtils.generate();
    const values = [
      createMockValue({
        entity: { id: entityId, name: 'Entity' },
        property: { id: propertyId, name: 'Start Time', dataType: 'TIME' },
        value: '1970-01-01T14:30:00.000Z',
      }),
    ];

    const result = prepareLocalDataForPublishing(values, [], 'test-space');
    const updateOp = result[0] as UpdateEntityOp;
    const setValue = updateOp.set[0].value as { type: string; value: string };
    expect(setValue.type).toBe('time');
    expect(setValue.value).toBe('14:30:00Z');
  });

  it('should produce SDK-compatible DATETIME value from stored ISO string', () => {
    const entityId = IdUtils.generate();
    const propertyId = IdUtils.generate();
    const values = [
      createMockValue({
        entity: { id: entityId, name: 'Entity' },
        property: { id: propertyId, name: 'Created At', dataType: 'DATETIME' },
        value: '2024-01-15T14:30:00.000Z',
      }),
    ];

    const result = prepareLocalDataForPublishing(values, [], 'test-space');
    const updateOp = result[0] as UpdateEntityOp;
    const setValue = updateOp.set[0].value as { type: string; value: string };
    expect(setValue.type).toBe('datetime');
    expect(setValue.value).toBe('2024-01-15T14:30:00Z');
  });
});

describe('parseDecimalString', () => {
  const parseDecimalString = Publish.parseDecimalString;

  it('should parse a simple decimal', () => {
    const result = parseDecimalString('10.1');
    expect(result.exponent).toBe(-1);
    expect(result.mantissa).toEqual({ type: 'i64', value: 101n });
  });

  it('should parse a decimal with leading zero', () => {
    const result = parseDecimalString('0.005');
    expect(result.exponent).toBe(-3);
    expect(result.mantissa).toEqual({ type: 'i64', value: 5n });
  });

  it('should parse a whole number', () => {
    const result = parseDecimalString('42');
    expect(result.exponent).toBe(0);
    expect(result.mantissa).toEqual({ type: 'i64', value: 42n });
  });

  it('should parse zero', () => {
    const result = parseDecimalString('0');
    expect(result.exponent).toBe(0);
    expect(result.mantissa).toEqual({ type: 'i64', value: 0n });
  });

  it('should parse zero with decimal point', () => {
    const result = parseDecimalString('0.0');
    expect(result.exponent).toBe(0);
    expect(result.mantissa).toEqual({ type: 'i64', value: 0n });
  });

  it('should normalize trailing zeros in the fraction', () => {
    // "1.0000" → combined = 10000, strip trailing zeros → mantissa = 1, exponent = 0
    const result = parseDecimalString('1.0000');
    expect(result.exponent).toBe(0);
    expect(result.mantissa).toEqual({ type: 'i64', value: 1n });
  });

  it('should normalize trailing zeros in whole numbers', () => {
    // "100" → mantissa = 1, exponent = 2
    const result = parseDecimalString('100');
    expect(result.exponent).toBe(2);
    expect(result.mantissa).toEqual({ type: 'i64', value: 1n });
  });

  it('should handle negative values', () => {
    const result = parseDecimalString('-3.14');
    expect(result.exponent).toBe(-2);
    expect(result.mantissa).toEqual({ type: 'i64', value: -314n });
  });

  it('should handle negative whole numbers', () => {
    const result = parseDecimalString('-50');
    expect(result.exponent).toBe(1);
    expect(result.mantissa).toEqual({ type: 'i64', value: -5n });
  });

  it('should handle negative zero', () => {
    const result = parseDecimalString('-0');
    expect(result.exponent).toBe(0);
    expect(result.mantissa).toEqual({ type: 'i64', value: 0n });
  });

  it('should trim whitespace', () => {
    const result = parseDecimalString('  12.5  ');
    expect(result.exponent).toBe(-1);
    expect(result.mantissa).toEqual({ type: 'i64', value: 125n });
  });

  it('should handle large precision decimals', () => {
    const result = parseDecimalString('123456789.123456789');
    expect(result.exponent).toBe(-9);
    expect(result.mantissa).toEqual({ type: 'i64', value: 123456789123456789n });
  });

  it('should handle "1.10" by normalizing the trailing zero', () => {
    // "1.10" → combined = 110, strip trailing zero → mantissa = 11, exponent = -1
    const result = parseDecimalString('1.10');
    expect(result.exponent).toBe(-1);
    expect(result.mantissa).toEqual({ type: 'i64', value: 11n });
  });
});
