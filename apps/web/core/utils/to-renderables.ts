import { SystemIds } from '@graphprotocol/grc-20';
import {
  DataType,
  FlattenedRenderType,
  NativeRenderableProperty,
  Property,
  RawRenderableType,
  Relation,
  RelationRenderableProperty,
  RenderableProperty,
  Value,
  ValueRenderableProperty,
} from '../v2.types';
import { GEO_LOCATION } from '../constants';

interface ToRenderablesArgs {
  entityId: string;
  entityName: string | null;
  values: Value[];
  relations: Relation[];
  spaceId: string;
  schema?: Property[];
  placeholderRenderables?: RenderableProperty[];
}

/**
 * Flattens the type hierarchy into a single render type.
 * This eliminates the need for nested type checking in components.
 */
function getFlattenedType(property: { dataType: DataType; renderableType?: RawRenderableType | null }): FlattenedRenderType {
  if (property.renderableType) {
    switch (property.renderableType) {
      case SystemIds.IMAGE:
        return 'IMAGE';
      case SystemIds.URL:
        return 'URL';
      case GEO_LOCATION:
        return 'GEO_LOCATION';
      case SystemIds.RELATION:
        return 'RELATION';
    }
  }
  
  // Fall back to dataType for all other cases
  return property.dataType;
}

/**
 * Flattens relation renderableType into display type
 */
function getFlattenedRelationType(renderableType: string): Extract<FlattenedRenderType, 'RELATION' | 'IMAGE'> {
  switch (renderableType) {
    case SystemIds.IMAGE_TYPE:
      return 'IMAGE';
    default:
      return 'RELATION';
  }
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
      const flattenedType = getFlattenedType(s);
      
      // Handle relation types
      if (flattenedType === 'RELATION') {
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
      }
      
      if (flattenedType === 'IMAGE') {
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
      }
      
      // Handle value types (including flattened ones like URL, GEO_LOCATION)
      return {
        type: flattenedType as NativeRenderableProperty['type'],
        renderableType: s.renderableType ?? undefined,
        entityId: entityId,
        entityName: entityName,
        propertyId: s.id,
        propertyName: s.name,
        spaceId,
        value: '',
        placeholder: true,
      };
    });

  const valuesToRenderable = values.map((t): ValueRenderableProperty => {
    const flattenedType = getFlattenedType(t.property);
    return {
      type: flattenedType as NativeRenderableProperty['type'],
      renderableType: t.property.renderableType ?? undefined,
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
    .filter(r => r.renderableType !== SystemIds.DATA_BLOCK && r.renderableType !== SystemIds.TEXT_BLOCK)
    .map((r): RelationRenderableProperty => {
      const flattenedType = getFlattenedRelationType(r.renderableType);
      
      return {
        type: flattenedType,
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
