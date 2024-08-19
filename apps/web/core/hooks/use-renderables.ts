import { SYSTEM_IDS } from '@geogenesis/sdk';
import { pipe } from 'effect';

import * as React from 'react';

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
export function useRenderables(serverTriples: Triple[]) {
  const isEditing = useUserIsEditing();
  const { placeholderRenderables, addPlaceholderRenderable } = usePlaceholderRenderables();

  // @TODO(relations): We may want to pass these in instead of reading from context so that
  // we can use the useRenderables hook for other contexts like tables. Alternatively we can
  // enforce that all consumers of useRenderables has the same context shape and wraps the hook.
  const { triples: localTriples, relations, schema, name, id, spaceId } = useEntityPageStore();

  const triplesFromSpace = useTriples(
    React.useMemo(() => {
      return {
        selector: t => t.space === spaceId,
      };
    }, [spaceId])
  );

  // We hydrate the local editable store with the triples from the server. While it's hydrating
  // we can fallback to the server triples so we render real data and there's no layout shift.
  //
  // There may be some deleted triples locally. We check the actions to make sure that there are
  // actually 0 actions in the case that there are 0 local triples as the local triples here
  // are only the ones where `isDeleted` is false.
  const triples = localTriples.length === 0 && triplesFromSpace.length === 0 ? serverTriples : localTriples;

  const renderables = toRenderables({
    entityId: id,
    entityName: name,
    spaceId,
    triples,
    relations,
    // We don't show placeholder renderables in browse mode
    schema: isEditing ? schema : undefined,
    placeholderRenderables: isEditing ? placeholderRenderables : undefined,
  })
    // We don't show blocks in the properties section
    .filter(r => r.attributeId !== SYSTEM_IDS.BLOCKS);

  const renderablesGroupedByAttributeId = pipe(
    renderables,
    renderables => sortRenderables(renderables),
    sortedRenderables => groupBy(sortedRenderables, r => r.attributeId)
  );

  return {
    renderablesGroupedByAttributeId,
    addPlaceholderRenderable,
  };
}

export function usePlaceholderRenderables() {
  const [placeholderRenderables, setPlaceholderRenderables] = React.useState<RenderableProperty[]>([]);

  const onAddPlaceholderRenderable = (renderable: RenderableProperty) => {
    const newPlaceholders = placeholderRenderables.filter(r => r.attributeId !== renderable.attributeId);
    setPlaceholderRenderables([...newPlaceholders, renderable]);
  };

  return {
    placeholderRenderables,
    addPlaceholderRenderable: onAddPlaceholderRenderable,
  };
}
