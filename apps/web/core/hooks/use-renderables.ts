import { SystemIds } from '@graphprotocol/grc-20';
import { pipe } from 'effect';
import { atom, useAtom } from 'jotai';
import { atomFamily } from 'jotai/utils';

import { useEntityPageStore } from '../state/entity-page-store/entity-store';
import { useValues } from '../sync/use-store';
import { toRenderables } from '../utils/to-renderables';
import { groupBy } from '../utils/utils';
import { Property, RenderableProperty, Value } from '../v2.types';
import { useUserIsEditing } from './use-user-is-editing';

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
export function useRenderables(serverValues: Value[], spaceId: string, isRelationPage?: boolean) {
  const isEditing = useUserIsEditing(spaceId);
  const { values: localValues, relations, schema, name, id } = useEntityPageStore();

  // Scope the placeholder renderables to the entityId so that we don't have to worry about
  // them being shared across different entities.
  const { placeholderRenderables, addPlaceholderRenderable, removeEmptyPlaceholderRenderable } =
    usePlaceholderRenderables(id);

  const valuesFromSpace = useValues({
    selector: t => t.spaceId === spaceId,
    includeDeleted: true,
  });

  // We hydrate the local editable store with the triples from the server. While it's hydrating
  // we can fallback to the server triples so we render real data and there's no layout shift.
  //
  // There may be some deleted triples locally. We check the actions to make sure that there are
  // actually 0 actions in the case that there are 0 local triples as the local triples here
  // are only the ones where `isDeleted` is false.
  const values = localValues.length === 0 && valuesFromSpace.length === 0 ? serverValues : localValues;

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

function usePlaceholderRenderables(entityId: string) {
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
