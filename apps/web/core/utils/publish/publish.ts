import { CreatePropertyOp, CreateRelationOp, DeleteRelationOp, Id, UnsetEntityValuesOp, UpdateEntityOp, SystemIds } from '@graphprotocol/grc-20';

import { DataType, Relation, Value } from '~/core/v2.types';
import { DATA_TYPE_PROPERTY } from '~/core/constants';

/**
 * Maps the local Geo Genesis data model for data to the GRC-20 compliant
 * Ops representation.
 */
export function prepareLocalDataForPublishing(values: Value[], relations: Relation[], spaceId: string) {
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

  const relationOps = relations.map((r): CreateRelationOp | DeleteRelationOp => {
    if (r.isDeleted) {
      return {
        type: 'DELETE_RELATION',
        id: Id.Id(r.id),
      };
    }

    return {
      type: 'CREATE_RELATION',
      relation: {
        id: Id.Id(r.id),
        type: Id.Id(r.type.id),
        entity: Id.Id(r.entityId),
        fromEntity: Id.Id(r.fromEntity.id),
        toEntity: Id.Id(r.toEntity.id),
        position: r.position ?? undefined,
        verified: r.verified ?? undefined,
        toSpace: r.toSpaceId ? Id.Id(r.toSpaceId) : undefined,
      },
    };
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

  // Create entity operations
  const entityOps: (UpdateEntityOp | UnsetEntityValuesOp)[] = [];

  /**
   * The ordering of set/unset for a given entity should be safe
   * since our local data model already ensures a single value
   * only exists one time for a given entity. We can't end up
   * in a situation where we create and delete a value at the
   * same time.
   */
  for (const [entityId, { deleted, set }] of Object.entries(valuesByEntity)) {
    if (set.length > 0) {
      const values = set.map(value => ({
        property: Id.Id(value.property.id),
        value: value.value,
        ...(value.options && {
          options: Object.fromEntries(Object.entries(value.options).filter(([, v]) => v !== undefined)),
        }),
      }));

      entityOps.push({
        type: 'UPDATE_ENTITY',
        entity: {
          id: Id.Id(entityId),
          values,
        },
      });
    }

    // Create UnsetEntityValuesOp for deleted values
    if (deleted.length > 0) {
      entityOps.push({
        type: 'UNSET_ENTITY_VALUES',
        unsetEntityValues: {
          id: Id.Id(entityId),
          properties: deleted.map(value => Id.Id(value.property.id)),
        },
      });
    }
  }

  // Create property operations for identified property entities
  const propertyOps: CreatePropertyOp[] = [];
  
  propertyEntityIds.forEach(propertyId => {
    // Find the dataType value for this property entity
    const dataTypeValue = validValues.find(
      v => v.entity.id === propertyId && v.property.id === DATA_TYPE_PROPERTY
    );
    
    if (dataTypeValue && dataTypeValue.value) {
      propertyOps.push({
        type: 'CREATE_PROPERTY',
        property: {
          id: Id.Id(propertyId),
          dataType: dataTypeValue.value as DataType,
        },
      });
    }
  });

  return [...relationOps, ...entityOps, ...propertyOps];
}
