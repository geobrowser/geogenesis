import { Relation } from '../types';

/** Whether a changed relation can be published with the SDK's updateRelation operation. */
export function canPublishRelationUpdate(base: Relation, changed: Relation) {
  const existsRemotely = base.isLocal !== true || base.hasBeenPublished === true || base.isRelationUpdate === true;

  const onlyUpdatesSupportedFields =
    base.id === changed.id &&
    base.entityId === changed.entityId &&
    base.type.id === changed.type.id &&
    base.fromEntity.id === changed.fromEntity.id &&
    base.toEntity.id === changed.toEntity.id &&
    base.spaceId === changed.spaceId;

  return existsRemotely && onlyUpdatesSupportedFields;
}
