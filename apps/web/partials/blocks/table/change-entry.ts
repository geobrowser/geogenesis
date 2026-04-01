import { IdUtils, SystemIds } from '@geoprotocol/geo-sdk';

import { Mutator } from '~/core/sync/use-mutate';
import { Property, Value } from '~/core/types';

/**
 * Actions that flow through onChangeEntry. All of these can be the first
 * interaction with a placeholder row, triggering entity creation.
 *
 * Property cells on existing entities write directly via storage.* since
 * they never involve placeholders. See writeValue() below.
 */
export type Action =
  | { type: 'SET_VALUE'; property: Pick<Property, 'id' | 'name' | 'dataType'>; value: string }
  | { type: 'SET_NAME'; name: string }
  | {
      type: 'FIND_ENTITY';
      entity: { id: string; name: string | null; space?: string; verified?: boolean };
    }
  | { type: 'CREATE_ENTITY'; name: string | null };

export type onChangeEntryFn = (entityId: string, spaceId: string, action: Action) => void;

export type onLinkEntryFn = (
  id: string,
  to: {
    id: string;
    name: string | null;
    space?: string;
    verified?: boolean;
  },
  currentlyVerified?: boolean
) => void;

/**
 * Shared value write logic used by onChangeEntry (for placeholder rows)
 * and by ValueGroup/EditableValueGroup (for existing entities).
 *
 * Determines create vs update based on whether existingValue is provided.
 */
export function writeValue(
  storage: Mutator,
  entityId: string,
  spaceId: string,
  property: Pick<Property, 'id' | 'name' | 'dataType'>,
  value: string,
  existingValue: Value | null
) {
  console.assert(entityId.length > 0, 'writeValue: entityId must be non-empty');
  console.assert(spaceId.length > 0, 'writeValue: spaceId must be non-empty');
  console.assert(property.id.length > 0, 'writeValue: property.id must be non-empty');

  // Only update in-place if the existing value belongs to the target space.
  // If it's from another space, create a new value in the target space instead
  // of mutating the foreign space's data (local override / fork model).
  if (existingValue && existingValue.spaceId === spaceId) {
    console.assert(
      existingValue.entity.id === entityId,
      `writeValue: existingValue entity ${existingValue.entity.id} does not match entityId ${entityId}`
    );
    storage.values.update(existingValue, draft => {
      draft.value = value;
      draft.property.dataType = property.dataType;
    });
  } else {
    storage.values.set({
      entity: { id: entityId, name: null },
      property: {
        id: property.id,
        name: property.name,
        dataType: property.dataType,
      },
      spaceId,
      value,
    });
  }
}

/**
 * Create a property relation linking fromEntity → toEntity via the given property type.
 * Used by RelationsGroup and EditableRelationsGroup when the user picks an existing entity.
 * If the property defines relationEntityTypes, those types are automatically assigned to the
 * relation entity (the edge/join entity).
 */
export function createPropertyRelation(
  storage: Mutator,
  spaceId: string,
  fromEntityId: string,
  property: Pick<Property, 'id' | 'name' | 'relationEntityTypes'>,
  target: { id: string; name: string | null; space?: string }
) {
  const relationEntityId = IdUtils.generate();

  storage.relations.set({
    id: IdUtils.generate(),
    entityId: relationEntityId,
    spaceId,
    renderableType: 'RELATION',
    toSpaceId: target.space,
    type: { id: property.id, name: property.name },
    fromEntity: { id: fromEntityId, name: null },
    toEntity: { id: target.id, name: target.name, value: target.id },
  });

  for (const relationType of property.relationEntityTypes ?? []) {
    createRelationEntityTypeRelation(storage, spaceId, relationEntityId, relationType);
  }
}

/**
 * Create a Types relation on a newly created entity, linking it to its expected type.
 * Used by RelationsGroup and EditableRelationsGroup onCreateEntity handlers.
 */
export function createTypeRelationForNewEntity(
  storage: Mutator,
  spaceId: string,
  newEntity: { id: string; name: string | null; space?: string; verified?: boolean },
  relationType: { id: string; name: string | null; spaceId?: string }
) {
  storage.relations.set({
    id: IdUtils.generate(),
    entityId: IdUtils.generate(),
    spaceId,
    renderableType: 'RELATION',
    verified: newEntity.verified,
    toSpaceId: relationType.spaceId,
    type: {
      id: SystemIds.TYPES_PROPERTY,
      name: 'Types',
    },
    fromEntity: {
      id: newEntity.id,
      name: newEntity.name,
    },
    toEntity: {
      id: relationType.id,
      name: relationType.name,
      value: relationType.id,
    },
  });
}

/**
 * Create a Types relation on a relation entity (relation.entityId), linking it to its expected type.
 * Used to auto-assign types to the edge/join entity when a new relation is created via a property
 * that has "Relation entity types" defined.
 */
export function createRelationEntityTypeRelation(
  storage: Mutator,
  spaceId: string,
  relationEntityId: string,
  relationType: { id: string; name: string | null; spaceId?: string }
) {
  storage.relations.set({
    id: IdUtils.generate(),
    entityId: IdUtils.generate(),
    spaceId,
    renderableType: 'RELATION',
    toSpaceId: relationType.spaceId,
    type: {
      id: SystemIds.TYPES_PROPERTY,
      name: 'Types',
    },
    fromEntity: {
      id: relationEntityId,
      name: null,
    },
    toEntity: {
      id: relationType.id,
      name: relationType.name,
      value: relationType.id,
    },
  });
}
