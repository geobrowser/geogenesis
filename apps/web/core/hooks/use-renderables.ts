import { GraphUrl, SystemIds } from '@graphprotocol/grc-20';
import { useQuery } from '@tanstack/react-query';
import { pipe } from 'effect';

import { EntityId } from '~/core/io/schema';

import { sortRenderables } from '~/partials/entity-page/entity-page-utils';

import { useTriples } from '../database/triples';
import { useEntityPageStore } from '../state/entity-page-store/entity-store';
import { useQueryEntitiesAsync } from '../sync/use-store';
import { PropertySchema, RenderableProperty, Triple, ValueTypeId } from '../types';
import { toRenderables } from '../utils/to-renderables';
import { groupBy } from '../utils/utils';
import { useUserIsEditing } from './use-user-is-editing';
import { atom, useAtom } from 'jotai';
import { atomFamily } from 'jotai/utils';

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
export function useRenderables(serverTriples: Triple[], spaceId: string, isRelationPage?: boolean) {
  const findMany = useQueryEntitiesAsync();
  const isEditing = useUserIsEditing(spaceId);
  const { triples: localTriples, relations, schema, name, id } = useEntityPageStore();
  
  // Scope the placeholder renderables to the entityId so that we don't have to worry about
  // them being shared across different entities.
  const { placeholderRenderables, addPlaceholderRenderable, removeEmptyPlaceholderRenderable } =
    usePlaceholderRenderables(EntityId(id));

  const triplesFromSpace = useTriples({
    selector: t => t.space === spaceId,
    includeDeleted: true,
  });

  // We hydrate the local editable store with the triples from the server. While it's hydrating
  // we can fallback to the server triples so we render real data and there's no layout shift.
  //
  // There may be some deleted triples locally. We check the actions to make sure that there are
  // actually 0 actions in the case that there are 0 local triples as the local triples here
  // are only the ones where `isDeleted` is false.
  const triples = localTriples.length === 0 && triplesFromSpace.length === 0 ? serverTriples : localTriples;

  const serverUrlTriples = serverTriples.filter(triple => triple.value.type === 'URL');

  const possibleTypeProperties = [...new Set(serverUrlTriples.map(triple => triple.attributeId))];

  const { data: typePropertySchema } = useQuery({
    queryKey: ['type-property-schema', possibleTypeProperties.join('-')],
    queryFn: async () => {
      const possibleTypePropertyAttributeEntities = await findMany({
        where: {
          id: {
            in: possibleTypeProperties,
          },
        },
      });

      const IS_TYPE_PROPERTY_ATTRIBUTE = 'T2TRBTBe5NS8vR94PLhzce';

      const typeProperties = possibleTypePropertyAttributeEntities
        ? possibleTypePropertyAttributeEntities
            .filter(
              entity =>
                entity?.triples?.find(triple => triple.attributeId === IS_TYPE_PROPERTY_ATTRIBUTE)?.value?.value === '1'
            )
            .map(entity => entity.id)
        : [];

      const typePropertyValueEntityIds = serverUrlTriples
        .filter(triple => typeProperties.includes(EntityId(triple.attributeId)))
        .map(triple => GraphUrl.toEntityId(triple.value.value as `graph://${string}`));

      const typePropertyValueEntities = await findMany({
        where: {
          id: {
            in: typePropertyValueEntityIds,
          },
        },
      });

      const typePropertySchema: PropertySchema[] = typePropertyValueEntities.flatMap(entity =>
        entity.relationsOut
          .filter(relation => relation.typeOf.id === EntityId(SystemIds.PROPERTIES))
          .map(relation => ({
            id: relation.toEntity.id,
            name: relation.toEntity.name,
            relationIndex: relation.index,
            valueType: SystemIds.RELATION as ValueTypeId,
          }))
      );

      return typePropertySchema;
    },
  });

  const fullSchema: PropertySchema[] = [...schema, ...(typePropertySchema ?? [])];

  const SKIPPED_PROPERTIES = !isRelationPage
    ? [EntityId(SystemIds.BLOCKS)]
    : [EntityId(SystemIds.BLOCKS), EntityId(SystemIds.TYPES_ATTRIBUTE)];

  const renderables = toRenderables({
    entityId: id,
    entityName: name,
    spaceId,
    triples,
    relations,
    // We don't show placeholder renderables in browse mode
    schema: isEditing ? fullSchema : undefined,
    placeholderRenderables: isEditing ? placeholderRenderables : undefined,
  }).filter(r => !SKIPPED_PROPERTIES.includes(EntityId(r.attributeId)));

  const renderablesGroupedByAttributeId = pipe(
    renderables,
    renderables => sortRenderables(renderables, !!isRelationPage, fullSchema),
    sortedRenderables => groupBy(sortedRenderables, r => r.attributeId)
  );

  return {
    renderablesGroupedByAttributeId,
    addPlaceholderRenderable,
    removeEmptyPlaceholderRenderable,
  };
}

const placeholderRenderablesAtomFamily = atomFamily(
  (entityId: EntityId) => atom<RenderableProperty[]>([]),
  (a, b) => a === b
);

function usePlaceholderRenderables(entityId: EntityId) {
  const [placeholderRenderables, setPlaceholderRenderables] = useAtom(placeholderRenderablesAtomFamily(entityId));

  const onAddPlaceholderRenderable = (renderable: RenderableProperty) => {
    const newPlaceholders = placeholderRenderables.filter(r => r.attributeId !== renderable.attributeId);
    setPlaceholderRenderables([...newPlaceholders, renderable]);
  };

  const onRemoveEmptyPlaceholderRenderable = (renderable: RenderableProperty) => {
    const newPlaceholders = placeholderRenderables.filter(r => r.attributeId !== renderable.attributeId);
    setPlaceholderRenderables([...newPlaceholders]);
  };

  return {
    placeholderRenderables,
    addPlaceholderRenderable: onAddPlaceholderRenderable,
    removeEmptyPlaceholderRenderable: onRemoveEmptyPlaceholderRenderable,
  };
}
