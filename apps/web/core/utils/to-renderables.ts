import { Relation } from '../io/dto/entities';
import { RelationRenderableProperty, RenderableProperty, Triple, TripleRenderableProperty } from '../types';

export function toRenderables(triples: Triple[], relations: Relation[], spaceId: string): RenderableProperty[] {
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
      entityId: r.typeOf.id,
      entityName: r.typeOf.name,
      attributeId: r.typeOf.id,
      attributeName: r.typeOf.name,
      spaceId,
      relationId: r.id,
      renderableType: r.toEntity.renderableType,
      value: r.toEntity.value, // This is either the image URL or the entity ID
      valueName: r.toEntity.name,
    };
  });

  return [...triplesToRenderable, ...relationsToRenderable];
}
