import { Id, Op, SystemIds } from '@geoprotocol/geo-sdk';

import { Relation, Value } from '~/core/v2.types';

/**
 * Maps the local Geo Genesis data model for data to the GRC-20 compliant
 * Ops representation.
 *
 * Note: Updated for new GRC-20 SDK (0.32.x) which uses:
 * - Lowercase type names: 'createRelation', 'deleteRelation', 'updateEntity', etc.
 * - Different operation structures
 */
export function prepareLocalDataForPublishing(values: Value[], relations: Relation[], spaceId: string): Op[] {
  const validValues = values.filter(
    // Deleted ops have a value of ''. Make sure we don't filter those out
    v =>
      v.spaceId === spaceId && !v.hasBeenPublished && v.property.id !== '' && v.entity.id !== '' && v.isLocal === true
  );

  // Identify property entities by looking for entities that have a TYPES_PROPERTY relation to PROPERTY
  const propertyEntityIds = new Set<string>();
  relations.forEach(r => {
    if (r.type.id === SystemIds.TYPES_PROPERTY && r.toEntity.id === SystemIds.PROPERTY && !r.isDeleted) {
      propertyEntityIds.add(r.fromEntity.id);
    }
  });

  // Create relation operations using new SDK format
  const relationOps: Op[] = relations.map(r => {
    if (r.isDeleted) {
      return {
        type: 'deleteRelation',
        id: Id(r.id),
      } as unknown as Op;
    }

    return {
      type: 'createRelation',
      id: Id(r.id),
      relationType: Id(r.type.id),
      entity: Id(r.entityId),
      from: Id(r.fromEntity.id),
      to: Id(r.toEntity.id),
      position: r.position ?? undefined,
      toSpace: r.toSpaceId ? Id(r.toSpaceId) : undefined,
    } as unknown as Op;
  });

  // Group values by entity ID and partition deleted vs non-deleted values
  const valuesByEntity = validValues.reduce(
    (acc, value) => {
      const entityId = value.entity.id;
      if (!acc[entityId]) {
        acc[entityId] = { deleted: [], set: [] };
      }

      if (value.isDeleted) {
        acc[entityId].deleted.push(value);
      } else {
        acc[entityId].set.push(value);
      }

      return acc;
    },
    // entity id -> changed values
    {} as Record<string, { deleted: Value[]; set: Value[] }>
  );

  // Create entity operations using new SDK format
  const entityOps: Op[] = [];

  /**
   * The ordering of set/unset for a given entity should be safe
   * since our local data model already ensures a single value
   * only exists one time for a given entity. We can't end up
   * in a situation where we create and delete a value at the
   * same time.
   */
  for (const [entityId, { deleted, set }] of Object.entries(valuesByEntity)) {
    // Create updateEntity operation for set values
    if (set.length > 0 || deleted.length > 0) {
      const setValues = set.map(value => ({
        property: Id(value.property.id),
        value: convertToSdkValue(value),
      }));

      const unsetValues = deleted.map(value => ({
        property: Id(value.property.id),
        language: { type: 'all' as const },
      }));

      entityOps.push({
        type: 'updateEntity',
        id: Id(entityId),
        set: setValues,
        unset: unsetValues,
      } as unknown as Op);
    }
  }

  // Note: Property creation is now handled differently in the new SDK
  // The dataType is specified when creating entity values with Graph.createProperty

  return [...relationOps, ...entityOps];
}

/**
 * SDK Value type for typed values
 */
// GRC-20 v2 SDK value types
type SdkValue =
  | { type: 'text'; value: string; language?: ReturnType<typeof Id> }
  | { type: 'bool'; value: boolean }
  | { type: 'int64'; value: number; unit?: ReturnType<typeof Id> }
  | { type: 'float64'; value: number; unit?: ReturnType<typeof Id> }
  | { type: 'decimal'; value: string; unit?: ReturnType<typeof Id> }
  | { type: 'date'; value: string }
  | { type: 'datetime'; value: string }
  | { type: 'time'; value: string }
  | { type: 'point'; lon: number; lat: number };

/**
 * Convert app value to new SDK value format.
 * The new SDK uses typed values like { type: 'text', value: 'string' }
 */
function convertToSdkValue(value: Value): SdkValue {
  const dataType = value.property.dataType;
  const val = value.value;

  switch (dataType) {
    case 'TEXT':
      return {
        type: 'text',
        value: val,
        ...(value.options?.language && { language: Id(value.options.language) }),
      };
    case 'BOOL':
      return {
        type: 'bool',
        value: val === '1' || val === 'true',
      };
    case 'INT64':
      return {
        type: 'int64',
        value: parseInt(val, 10) || 0,
        ...(value.options?.unit && { unit: Id(value.options.unit) }),
      };
    case 'FLOAT64':
      return {
        type: 'float64',
        value: parseFloat(val) || 0,
        ...(value.options?.unit && { unit: Id(value.options.unit) }),
      };
    case 'DECIMAL':
      return {
        type: 'decimal',
        value: val,
        ...(value.options?.unit && { unit: Id(value.options.unit) }),
      };
    case 'DATE':
      return {
        type: 'date',
        value: val,
      };
    case 'DATETIME':
      return {
        type: 'datetime',
        value: val,
      };
    case 'TIME':
      return {
        type: 'time',
        value: val,
      };
    case 'POINT': {
      try {
        const point = JSON.parse(val);
        return {
          type: 'point',
          lon: point.lon ?? point.x ?? 0,
          lat: point.lat ?? point.y ?? 0,
        };
      } catch {
        return { type: 'point', lon: 0, lat: 0 };
      }
    }
    default:
      // Default to text for unknown types (BYTES, SCHEDULE, EMBEDDING)
      return { type: 'text', value: val };
  }
}

export const Publish = {
  prepareLocalDataForPublishing,
};
