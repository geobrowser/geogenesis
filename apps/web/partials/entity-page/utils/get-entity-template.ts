import { SystemIds } from '@geoprotocol/geo-sdk';
import { Effect } from 'effect';

import { ROOT_SPACE } from '~/core/constants';
import { getEntity } from '~/core/io/v2/queries';
import { getRelations, getValues } from '~/core/sync/use-store';
import { cloneEntity } from '~/core/utils/contracts/clone-entity';
import { convertOpsToRenderables } from '~/core/utils/ops/ops-to-renderable';
import { Relation, Value } from '~/core/v2.types';

const TEMPLATE_PROPERTY_ID = 'cf37cd59840c4daca22b9d9dde536ea7';

/**
 * Gets template values and relations for an entity when a type is added to an otherwise empty
 * entity. Returns null if the entity already has data or the type has no template.
 */
export async function getEntityTemplate(
  typeId: string,
  entityId: string,
  entityName: string | null,
  spaceId: string
): Promise<{ values: Value[]; relations: Relation[] } | null> {
  const values = getValues({
    selector: v => v.entity.id === entityId && !v.isDeleted,
  });

  const relations = getRelations({
    selector: r => r.fromEntity.id === entityId && !r.isDeleted,
  });

  const hasValues = values.some(v => v.property?.id !== SystemIds.NAME_PROPERTY);

  const nonTypeRelations = relations.filter(r => r.type.id !== SystemIds.TYPES_PROPERTY);

  if (hasValues || nonTypeRelations.length > 0) {
    return null;
  }

  let typeEntity;

  try {
    typeEntity = await Effect.runPromise(getEntity(typeId, spaceId));

    if (!typeEntity && spaceId !== ROOT_SPACE) {
      typeEntity = await Effect.runPromise(getEntity(typeId, ROOT_SPACE));
    }

    if (!typeEntity) {
      return null;
    }
  } catch {
    return null;
  }

  const templateRelation = typeEntity.relations.find(r => r.type.id === TEMPLATE_PROPERTY_ID && !r.isDeleted);

  if (!templateRelation) {
    return null;
  }

  const templateId = templateRelation.toEntity.id;

  let templateSpaceId = spaceId;
  let templateEntity;

  try {
    templateEntity = await Effect.runPromise(getEntity(templateId, spaceId));

    if (!templateEntity && spaceId !== ROOT_SPACE) {
      templateEntity = await Effect.runPromise(getEntity(templateId, ROOT_SPACE));

      if (templateEntity) {
        templateSpaceId = ROOT_SPACE;
      }
    }

    if (!templateEntity) {
      return null;
    }
  } catch {
    return null;
  }

  const [ops] = await cloneEntity({
    oldEntityId: templateId,
    entityId: entityId,
    entityName: entityName,
    spaceId: templateSpaceId,
  });

  const options = { spaceId, entityName };

  const renderables = convertOpsToRenderables(ops, options);

  return renderables;
}
