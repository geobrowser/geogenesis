import { IdUtils } from '@geoprotocol/geo-sdk/lite';

import { ID } from '~/core/id';
import type { Mutator } from '~/core/sync/use-mutate';
import { getRelations, getValues } from '~/core/sync/use-store';

export function cloneEntityIntoSpace(
  entityId: string,
  sourceSpaceId: string,
  targetSpaceId: string,
  storage: Mutator
) {
  const sourceValues = getValues({
    selector: value => value.entity.id === entityId && value.spaceId === sourceSpaceId,
  });

  const sourceRelations = getRelations({
    selector: relation => relation.fromEntity.id === entityId && relation.spaceId === sourceSpaceId,
  });

  const existingTargetValueIds = new Set(
    getValues({
      selector: value => value.entity.id === entityId && value.spaceId === targetSpaceId,
    }).map(value => value.id)
  );

  const existingTargetRelationSignatures = new Set(
    getRelations({
      selector: relation => relation.fromEntity.id === entityId && relation.spaceId === targetSpaceId,
    }).map(
      relation =>
        `${relation.type.id}|${relation.fromEntity.id}|${relation.toEntity.id}|${relation.toSpaceId ?? ''}|${
          relation.renderableType
        }`
    )
  );

  sourceValues.forEach(value => {
    const id = ID.createValueId({
      entityId: value.entity.id,
      propertyId: value.property.id,
      spaceId: targetSpaceId,
    });

    if (existingTargetValueIds.has(id)) return;

    storage.values.set({
      ...value,
      id,
      spaceId: targetSpaceId,
      entity: { ...value.entity },
      property: { ...value.property },
    });
  });

  sourceRelations.forEach(relation => {
    const signature = `${relation.type.id}|${relation.fromEntity.id}|${relation.toEntity.id}|${
      relation.toSpaceId ?? ''
    }|${relation.renderableType}`;

    if (existingTargetRelationSignatures.has(signature)) return;

    storage.relations.set({
      ...relation,
      id: IdUtils.generate(),
      entityId: IdUtils.generate(),
      spaceId: targetSpaceId,
      fromEntity: { ...relation.fromEntity },
      toEntity: { ...relation.toEntity },
      type: { ...relation.type },
    });
  });
}
