import { Relation } from '../io/dto/entities';
import { EntityId } from '../io/schema';
import { RelationRenderableProperty, RenderableProperty, Triple, TripleRenderableProperty } from '../types';

interface ToRenderablesArgs {
  entityId: string;
  entityName: string | null;
  triples: Triple[];
  relations: Relation[];
  spaceId: string;
  schema?: { id: EntityId; name: string | null }[];
  placeholderRenderables?: RenderableProperty[];
}

export function toRenderables({
  entityId,
  entityName,
  triples,
  relations,
  spaceId,
  schema,
  placeholderRenderables,
}: ToRenderablesArgs): RenderableProperty[] {
  // The schema for a given set of types define the expected attributes and relations for
  // any entities with those types. We want to show any properties from the schema that
  // aren't already set on the entity.
  const attributesWithAValue = new Set([...triples.map(t => t.attributeId), ...relations.map(r => r.typeOf.id)]);
  const placeholders = new Set([...(placeholderRenderables?.map(r => r.attributeId) ?? [])]);

  // Make some placeholder triples derived from the schema. We later hide and show these depending
  // on if the entity has filled these fields or not.
  // @TODO: We need to know the schema value type to know the type of renderable we need
  // to show. We can default to TEXT for now.
  const schemaRenderable = (schema ?? [])
    .filter(renderable => !attributesWithAValue.has(renderable.id) && !placeholders.has(renderable.id))
    .map((s): TripleRenderableProperty => {
      return {
        type: 'TEXT',
        entityId: entityId,
        entityName: entityName,
        attributeId: s.id,
        attributeName: s.name,
        spaceId,
        value: '',
      };
    });

  const triplesToRenderable = triples.map((t): TripleRenderableProperty => {
    if (t.value.type === 'ENTITY') {
      return {
        type: t.value.type,
        entityId: t.entityId,
        entityName: t.entityName,
        attributeId: t.attributeId,
        attributeName: t.attributeName,
        spaceId,
        value: { value: t.value.value, name: t.value.name },
      };
    }

    return {
      type: t.value.type,
      entityId: t.entityId,
      entityName: t.entityName,
      attributeId: t.attributeId,
      attributeName: t.attributeName,
      spaceId,
      value: t.value.value,
    };
  });

  const relationsToRenderable = relations.map((r): RelationRenderableProperty => {
    return {
      type: 'RELATION',
      entityId: r.id,
      entityName: null,
      attributeId: r.typeOf.id,
      attributeName: r.typeOf.name,
      spaceId,
      relationId: r.id,
      value: r.toEntity.value, // This is either the image URL or the entity ID
      valueName: r.toEntity.name,
    };
  });

  return [
    ...triplesToRenderable,
    ...relationsToRenderable,
    ...schemaRenderable,
    // If we've finished entering data for a Property and written it to the DB we don't need
    // to show the placeholder for that attribute anymore.
    ...(placeholderRenderables ?? []).filter(r => !attributesWithAValue.has(r.attributeId)),
  ];
}
