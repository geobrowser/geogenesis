import { CreateRelationOp, DeleteRelationOp, Id, UnsetEntityValuesOp, UpdateEntityOp } from '@graphprotocol/grc-20';

import { Relation, Value } from '~/core/v2.types';

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
    // Create UpdateEntityOp for non-deleted values
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

  return [...relationOps, ...entityOps];
}
