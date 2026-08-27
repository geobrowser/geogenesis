import { Relation } from '../types';

/** Whether a relation already has a remote identity that must not be reused. */
export function isExistingRelation(relation: Relation) {
  return relation.isLocal !== true || relation.hasBeenPublished === true || relation.isRelationUpdate === true;
}

/** Whether a relation change requires deleting the old edge and creating a new one. */
export function requiresRelationIdentityReplacement(base: Relation, changed: Relation) {
  if (!isExistingRelation(base)) return false;

  return (
    base.id !== changed.id ||
    base.entityId !== changed.entityId ||
    base.type.id !== changed.type.id ||
    base.fromEntity.id !== changed.fromEntity.id ||
    base.toEntity.id !== changed.toEntity.id ||
    base.spaceId !== changed.spaceId
  );
}

/** Whether a remote relation can retain its identity after a local change. */
export function isExistingRelationWithUnchangedIdentity(base: Relation, changed: Relation) {
  return isExistingRelation(base) && !requiresRelationIdentityReplacement(base, changed);
}

/** Tracks optional relation fields that must be explicitly cleared remotely. */
export function getRelationUpdateUnsetFields(base: Relation, changed: Relation) {
  const unsetFields = new Set(base.relationUpdateUnsetFields ?? []);

  if (changed.toSpaceId) {
    unsetFields.delete('toSpace');
  } else if (base.toSpaceId) {
    unsetFields.add('toSpace');
  }

  return Array.from(unsetFields);
}
