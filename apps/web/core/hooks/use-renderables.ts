import { GraphUrl, SYSTEM_IDS } from '@geogenesis/sdk';
import { useQuery } from '@tanstack/react-query';
import { pipe } from 'effect';

import * as React from 'react';

import { EntityId } from '~/core/io/schema';
import { fetchEntitiesBatch } from '~/core/io/subgraph/fetch-entities-batch';

import { sortRenderables } from '~/partials/entity-page/entity-page-utils';

import { useTriples } from '../database/triples';
import { useEntityPageStore } from '../state/entity-page-store/entity-store';
import { RenderableProperty, Triple } from '../types';
import { toRenderables } from '../utils/to-renderables';
import { groupBy } from '../utils/utils';
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
export function useRenderables(serverTriples: Triple[], spaceId: string, isRelationPage?: boolean) {
  const isEditing = useUserIsEditing(spaceId);
  const { placeholderRenderables, addPlaceholderRenderable, removeEmptyPlaceholderRenderable } =
    usePlaceholderRenderables();

  const { triples: localTriples, relations, schema, name, id } = useEntityPageStore();

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

  const { data: typePropertyRenderables } = useQuery({
    queryKey: ['type-property-renderables', possibleTypeProperties.join('-')],
    queryFn: async () => {
      const possibleTypePropertyAttributeEntities = await fetchEntitiesBatch({
        spaceId: SYSTEM_IDS.ROOT_SPACE_ID,
        entityIds: possibleTypeProperties,
      });

      const typeProperties = possibleTypePropertyAttributeEntities
        ? possibleTypePropertyAttributeEntities
            .filter(
              entity =>
                entity?.triples?.find(triple => triple.attributeId === SYSTEM_IDS.IS_TYPE_PROPERTY_ATTRIBUTE)?.value
                  ?.value === '1'
            )
            .map(entity => entity.id)
        : [];

      const typePropertyValueEntityIds = serverUrlTriples
        .filter(triple => typeProperties.includes(EntityId(triple.attributeId)))
        .map(triple => GraphUrl.toEntityId(triple.value.value as `graph://${string}`));

      const typePropertyValueEntities = await fetchEntitiesBatch({
        spaceId: SYSTEM_IDS.ROOT_SPACE_ID,
        entityIds: typePropertyValueEntityIds,
      });

      const typePropertyRenderables = typePropertyValueEntities.flatMap(entity =>
        entity.relationsOut
          .filter(relation => relation.typeOf.id === SYSTEM_IDS.PROPERTIES)
          .map(relation => ({
            type: 'RELATION',
            entityId: relation.toEntity.id,
            entityName: null,
            attributeId: relation.toEntity.id,
            attributeName: relation.toEntity.name,
            spaceId,
            value: '',
            placeholder: true,
          }))
      );

      return typePropertyRenderables;
    },
  });

  const SKIPPED_PROPERTIES = !isRelationPage ? [SYSTEM_IDS.BLOCKS] : [SYSTEM_IDS.BLOCKS, SYSTEM_IDS.TYPES_ATTRIBUTE];

  const renderables = toRenderables({
    entityId: id,
    entityName: name,
    spaceId,
    triples,
    relations,
    // We don't show placeholder renderables in browse mode
    schema: isEditing ? schema : undefined,
    placeholderRenderables: isEditing
      ? [...placeholderRenderables, ...((typePropertyRenderables ?? []) as RenderableProperty[])]
      : undefined,
  }).filter(r => !SKIPPED_PROPERTIES.includes(r.attributeId));

  const renderablesGroupedByAttributeId = pipe(
    renderables,
    renderables => sortRenderables(renderables, !!isRelationPage),
    sortedRenderables => groupBy(sortedRenderables, r => r.attributeId)
  );

  return {
    renderablesGroupedByAttributeId,
    addPlaceholderRenderable,
    removeEmptyPlaceholderRenderable,
  };
}

function usePlaceholderRenderables() {
  const [placeholderRenderables, setPlaceholderRenderables] = React.useState<RenderableProperty[]>([]);

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
