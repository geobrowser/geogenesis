import {
  PropertySchema,
  Relation,
  RelationRenderableProperty,
  RenderableProperty,
  Value,
  ValueRenderableProperty,
} from '../v2.types';

interface ToRenderablesArgs {
  entityId: string;
  entityName: string | null;
  values: Value[];
  relations: Relation[];
  spaceId: string;
  schema?: PropertySchema[];
  placeholderRenderables?: RenderableProperty[];
}

export function toRenderables({
  entityId,
  entityName,
  values,
  relations,
  spaceId,
  schema,
  placeholderRenderables,
}: ToRenderablesArgs): RenderableProperty[] {
  // The schema for a given set of types define the expected attributes and relations for
  // any entities with those types. We want to show any properties from the schema that
  // aren't already set on the entity.
  const attributesWithAValue = new Set([...values.map(t => t.property.id), ...relations.map(r => r.type.id)]);
  const placeholders = new Set([...(placeholderRenderables?.map(r => r.propertyId) ?? [])]);

  // Make some placeholder triples derived from the schema. We later hide and show these depending
  // on if the entity has filled these fields or not.
  const schemaRenderables = (schema ?? [])
    .filter(renderable => !attributesWithAValue.has(renderable.id) && !placeholders.has(renderable.id))
    .map((s): ValueRenderableProperty | RelationRenderableProperty => {
      switch (s.renderableType) {
        case 'RELATION':
          return {
            type: 'RELATION',
            relationId: s.id,
            relationEntityId: '',
            valueName: s.name,
            fromEntityId: entityId,
            fromEntityName: entityName,
            propertyId: s.id,
            propertyName: s.name,
            spaceId,
            value: '',
            placeholder: true,
          };
        case 'IMAGE':
          return {
            type: 'IMAGE',
            relationId: s.id,
            relationEntityId: '',
            valueName: s.name,
            fromEntityId: entityId,
            fromEntityName: entityName,
            propertyId: s.id,
            propertyName: s.name,
            spaceId,
            value: '',
            placeholder: true,
          };
        default:
          return {
            type: s.dataType,
            entityId: entityId,
            entityName: entityName,
            propertyId: s.id,
            propertyName: s.name,
            spaceId,
            value: '',
            placeholder: true,
          };
      }
    });

  const valuesToRenderable = values.map((t): ValueRenderableProperty => {
    return {
      type: t.property.dataType,
      entityId: t.entity.id,
      entityName: t.entity.name,
      propertyId: t.property.id,
      propertyName: t.property.name,
      spaceId: t.spaceId,
      value: t.value,
      options: t.options ?? undefined,
    };
  });

  const relationsToRenderable = relations
    // DATA and TEXT relations are mostly consumed by components rendering blocks. We don't
    // care about those in the property area.
    .filter(r => r.renderableType !== 'DATA' && r.renderableType !== 'TEXT')
    .map((r): RelationRenderableProperty => {
      switch (r.renderableType) {
        case 'IMAGE':
          return {
            type: 'IMAGE', // We filter out data and text relations above
            relationEntityId: r.entityId,
            fromEntityId: entityId,
            fromEntityName: null,
            propertyId: r.type.id,
            propertyName: r.type.name,
            spaceId: r.spaceId,
            relationId: r.id,
            value: r.toEntity.value, // This is either the image URL or the entity ID
            valueName: r.toEntity.name,
          };
        default:
          return {
            type: 'RELATION', // We filter out data and text relations above
            relationEntityId: r.entityId,
            fromEntityId: entityId,
            fromEntityName: null,
            propertyId: r.type.id,
            propertyName: r.type.name,
            spaceId: r.spaceId,
            relationId: r.id,
            value: r.toEntity.value, // This is either the image URL or the entity ID
            valueName: r.toEntity.name,
          };
      }
    });

  return [
    ...valuesToRenderable,
    ...relationsToRenderable,
    ...schemaRenderables,
    // If we've finished entering data for a Property and written it to the DB we don't need
    // to show the placeholder for that attribute anymore.
    ...(placeholderRenderables ?? []).filter(r => !attributesWithAValue.has(r.propertyId)),
  ];
}
