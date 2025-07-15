import { SystemIds } from '@graphprotocol/grc-20';
import { pipe } from 'effect';
import { atom, useAtom } from 'jotai';
import { atomFamily } from 'jotai/utils';

import * as React from 'react';

import { useEntity } from '../database/entities';
import { useEntitySchema, useName } from '../state/entity-page-store/entity-store';
import { useEntityStoreInstance } from '../state/entity-page-store/entity-store-provider';
import { useRelations, useValues } from '../sync/use-store';
import { toRenderables } from '../utils/to-renderables';
import { groupBy } from '../utils/utils';
import { DataType, Property, Relation, RenderableProperty, Value } from '../v2.types';
import { useProperties } from './use-properties';
import { useUserIsEditing } from './use-user-is-editing';

const SKIPPED_PROPERTIES: string[] = [SystemIds.BLOCKS];

export function useRenderedProperties(entityId: string, spaceId: string) {
  const values = useValues({
    selector: v => v.spaceId === spaceId && v.entity.id === entityId,
  });

  const relations = useRelations({
    selector: r => r.fromEntity.id === entityId && r.spaceId === spaceId,
  });

  const uniqueProperties = new Set(
    [...values.map(v => v.property.id), ...relations.map(r => r.type.id)].filter(p => !SKIPPED_PROPERTIES.includes(p))
  );

  return useProperties([...uniqueProperties.values()]) ?? {};
}

export function usePlaceholderProperties(entityId: string, spaceId: string) {
  const schema = useEntitySchema(entityId, spaceId);
  const map: Record<string, Property> = {};

  for (const p of schema) {
    map[p.id] = p;
  }

  return map;
}

/**
 * When rendering the underlying data for Properties we map them to a shared data structure
 * that can be used to represent both triples and relations. Additionally, we also want to
 * render renderable fields that act as placeholders for data users haven't entered in yet.
 *
 * For example, when you create a property there's no data yet, so we don't want to write
 * to the DB until the field has been filled out. These placeholders are represented as
 * RenderableProperty as well.
 *
 * Schemas are derived from the entity's types and are also a form of placeholders.
 */
export function useRenderables(spaceId: string, isRelationPage?: boolean) {
  const isEditing = useUserIsEditing(spaceId);
  const { id } = useEntityStoreInstance();
  const name = useName(id, spaceId);

  const { schema } = useEntity({ id, spaceId });

  // @TODO
  // Use the schema and placeholders to determine what placeholders we need.
  // During render we can remove placeholders if we already have data for it.
  // Rather than doing it in here.
  //
  // We can probably have a placeholderValues and placeholderRelations so we
  // don't need to merge both. These can be stored as state and just read by
  // each rendered value or relation
  //
  // To generate the placeholders we need to be calculate the schema for an
  // entity. We should just make a useSchema hook that reads useTypes and
  // then fetches all the properties as needed. We can also put the code
  // for semantic schema expansion there, too. We already have all the code
  // we need for normal schema in useEntity.
  //
  // @NOTE – how to optimize?
  // Lastly we can keep track of all the properties we're rendering. To do so
  // we actually need to track all the values and relations again so we end up
  // back to non-granular rendering? I guess this should only re-render if there
  // is actually new data and shouldn't re-render if we have the same properties
  // as last render.

  // Scope the placeholder renderables to the entityId so that we don't have to worry about
  // them being shared across different entities.
  const { placeholderRenderables, addPlaceholderRenderable, removeEmptyPlaceholderRenderable } =
    usePlaceholderRenderables(id);

  const values = useValues({
    selector: v => v.spaceId === spaceId && v.entity.id === id,
  });

  const relations = useRelations({
    selector: r => r.fromEntity.id === id && r.spaceId === spaceId,
  });

  // @TODO(migration): Type properties aren't working with new data model
  // const serverUrlValues = serverValues.filter(triple => triple.value.type === 'URL');

  // const possibleTypeProperties = [...new Set(serverUrlValues.map(triple => triple.attributeId))];

  // const { data: typePropertySchema } = useQuery({
  //   queryKey: ['type-property-schema', possibleTypeProperties.join('-')],
  //   queryFn: async () => {
  //     const possibleTypePropertyAttributeEntities = await findMany({
  //       where: {
  //         id: {
  //           in: possibleTypeProperties,
  //         },
  //       },
  //     });

  //     // @TODO(migration): SystemIds
  //     const IS_TYPE_PROPERTY_PROPERTY = 'T2TRBTBe5NS8vR94PLhzce';

  //     const typeProperties = possibleTypePropertyAttributeEntities
  //       ? possibleTypePropertyAttributeEntities
  //           .filter(
  //             entity => entity?.values?.find(value => value.property.id === IS_TYPE_PROPERTY_PROPERTY)?.value === '1'
  //           )
  //           .map(entity => entity.id)
  //       : [];

  //     const typePropertyValueEntityIds = serverUrlValues
  //       .filter(triple => typeProperties.includes(EntityId(triple.property.id)))
  //       .map(triple => GraphUrl.toEntityId(triple.value as `graph://${string}`));

  //     const typePropertyValueEntities = await findMany({
  //       where: {
  //         id: {
  //           in: typePropertyValueEntityIds,
  //         },
  //       },
  //     });

  //     const typePropertySchema = typePropertyValueEntities.flatMap(entity =>
  //       entity.relationsOut
  //         .filter(relation => relation.typeOf.id === EntityId(SystemIds.PROPERTIES))
  //         .map(relation => ({
  //           id: relation.toEntity.id,
  //           name: relation.toEntity.name,
  //           valueType: SystemIds.RELATION as ValueTypeId,
  //         }))
  //     );

  //     return typePropertySchema;
  //   },
  // });
  // @TODO(migration): Get semantic type expansion from relations
  const typePropertySchema = undefined;

  const fullSchema: Property[] = [...schema, ...(typePropertySchema ?? [])];

  const SKIPPED_PROPERTIES: string[] = !isRelationPage
    ? [SystemIds.BLOCKS]
    : [SystemIds.BLOCKS, SystemIds.TYPES_PROPERTY];

  const renderables = toRenderables({
    entityId: id,
    entityName: name,
    spaceId,
    values,
    relations,
    // We don't show placeholder renderables in browse mode
    schema: isEditing ? fullSchema : undefined,
    placeholderRenderables: isEditing ? placeholderRenderables : undefined,
  }).filter(r => !SKIPPED_PROPERTIES.includes(r.propertyId));

  const renderablesGroupedByAttributeId = pipe(
    renderables,
    renderables => sortRenderables(renderables, !!isRelationPage),
    sortedRenderables => groupBy(sortedRenderables, r => r.propertyId)
  );

  return {
    renderablesGroupedByAttributeId,
    addPlaceholderRenderable,
    removeEmptyPlaceholderRenderable,
  };
}

const placeholderRenderablesAtomFamily = atomFamily(
  (entityId: string) => atom<RenderableProperty[]>([]),
  (a, b) => a === b
);

/**
 * Placeholders should be generated by creating empty data, or
 * as derived from an entity's schema.
 *
 * Additionally, we shouldn't return renderables from here. Can
 * solve that afterwards.
 */

export function usePlaceholderRenderables(entityId: string) {
  const [placeholderRenderables, setPlaceholderRenderables] = useAtom(placeholderRenderablesAtomFamily(entityId));

  const onAddPlaceholderRenderable = (renderable: RenderableProperty) => {
    const newPlaceholders = placeholderRenderables.filter(r => r.propertyId !== renderable.propertyId);
    setPlaceholderRenderables([...newPlaceholders, renderable]);
  };

  const onRemoveEmptyPlaceholderRenderable = (renderable: RenderableProperty) => {
    const newPlaceholders = placeholderRenderables.filter(r => r.propertyId !== renderable.propertyId);
    setPlaceholderRenderables([...newPlaceholders]);
  };

  return {
    placeholderRenderables,
    addPlaceholderRenderable: onAddPlaceholderRenderable,
    removeEmptyPlaceholderRenderable: onRemoveEmptyPlaceholderRenderable,
  };
}

export function usePlaceholderRenderables_V2(entityId: string) {
  const [placeholders, setPlaceholders] = React.useState<Record<string, Value | Relation>>({});

  const onAddPlaceholderRenderable = (placeholdersToAdd: { propertyId: string; dataType: DataType }[]) => {
    const newPlaceholders = placeholders;

    for (const newPlaceholder of placeholdersToAdd) {
      if (newPlaceholder.dataType === 'RELATION') {
        // ... Add placeholder relation
      } else {
        // ... Add placeholder value
      }
    }

    setPlaceholders(newPlaceholders);
  };

  const getPlaceholder = (propertyId: string, dataType: DataType) => {
    const placeholder = placeholders[propertyId];

    if (placeholder) {
      if (dataType === 'RELATION') {
        return isRelation(placeholder) ? placeholder : null;
      }

      return isValue(placeholder) ? placeholder : null;
    }

    return null;
  };

  return {
    placeholders,
    addPlaceholder: onAddPlaceholderRenderable,
    getPlaceholder,
  };
}

function isValue(value: Relation | Value): value is Value {
  return 'value' in value;
}

function isRelation(relation: Relation | Value): relation is Relation {
  return 'fromEntity' in relation;
}

export function sortRenderables(renderables: RenderableProperty[], isRelationPage?: boolean) {
  /* Visible triples includes both real triples and placeholder triples */
  return renderables.sort((renderableA, renderableB) => {
    // Always put an empty, placeholder triple with no attribute id at the bottom
    // of the list
    if (renderableA.propertyId === '') return 1;

    const { propertyId: propertyIdA, propertyName: propertyNameA } = renderableA;
    const { propertyId: propertyIdB, propertyName: propertyNameB } = renderableB;

    const isNameA = propertyIdA === SystemIds.NAME_PROPERTY;
    const isNameB = propertyIdB === SystemIds.NAME_PROPERTY;
    const isDescriptionA = propertyIdA === SystemIds.DESCRIPTION_PROPERTY;
    const isDescriptionB = propertyIdB === SystemIds.DESCRIPTION_PROPERTY;
    const isTypesA = propertyIdA === SystemIds.TYPES_PROPERTY;
    const isTypesB = propertyIdB === SystemIds.TYPES_PROPERTY;

    if (isRelationPage) {
      const isRelationTypeA = propertyIdA === SystemIds.RELATION_TYPE_PROPERTY;
      const isRelationTypeB = propertyIdB === SystemIds.RELATION_TYPE_PROPERTY;

      const isRelationFromA = propertyIdA === SystemIds.RELATION_FROM_PROPERTY;
      const isRelationFromB = propertyIdB === SystemIds.RELATION_FROM_PROPERTY;

      const isRelationToA = propertyIdA === SystemIds.RELATION_TO_PROPERTY;
      const isRelationToB = propertyIdB === SystemIds.RELATION_TO_PROPERTY;

      const isRelationIndexA = propertyIdA === SystemIds.RELATION_INDEX;
      const isRelationIndexB = propertyIdB === SystemIds.RELATION_INDEX;

      if (isRelationTypeA && !isRelationTypeB) return -1;
      if (!isRelationTypeA && isRelationTypeB) return 1;

      if (isRelationFromA && !isRelationFromB) return -1;
      if (!isRelationFromA && isRelationFromB) return 1;

      if (isRelationToA && !isRelationToB) return -1;
      if (!isRelationToA && isRelationToB) return 1;

      if (isRelationIndexA && !isRelationIndexB) return 1;
    }

    if (isNameA && !isNameB) return -1;
    if (!isNameA && isNameB) return 1;

    if (isDescriptionA && !isDescriptionB) return -1;
    if (!isDescriptionA && isDescriptionB) return 1;

    if (isTypesA && !isTypesB) return -1;
    if (!isTypesA && isTypesB) return 1;

    return (propertyNameA || '').localeCompare(propertyNameB || '');
  });
}

export function useEditableProperties(entityId: string, spaceId: string) {
  const renderedProperties = useRenderedProperties(entityId, spaceId);
  const placeholderProperties = usePlaceholderProperties(entityId, spaceId);

  const properties: Record<string, Property> = {};

  for (const p of [...Object.values(placeholderProperties)]) {
    properties[p.id] = p;
  }

  for (const p of [...Object.values(renderedProperties)]) {
    properties[p.id] = p;
  }

  return properties;
}
