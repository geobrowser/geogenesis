import { Position, SystemIds } from '@geoprotocol/geo-sdk/lite';
import { keepPreviousData } from '@tanstack/react-query';

import * as React from 'react';

import { useEditorStoreLite } from '~/core/state/editor/use-editor';
import { WhereCondition } from '~/core/sync/experimental_query-layer';
import { useQueryEntities, useQueryEntity } from '~/core/sync/use-store';
import { Entity, Relation } from '~/core/types';

import { Source } from './source';
import { useDataBlockInstance } from './use-data-block';

function deduplicateRelationsByEntityId<T extends Pick<Relation, 'toEntity'>>(relations: T[]): T[] {
  const seen = new Set<string>();
  return relations.filter(relation => {
    if (seen.has(relation.toEntity.id)) {
      return false;
    }
    seen.add(relation.toEntity.id);
    return true;
  });
}

export interface CollectionProps {
  source: Source;
  first?: number;
  /**
   * Active page index (0-based). Used to slice locally-known collection
   * relations into a window before issuing the entity fetch. Cursor-based
   * pagination on the server is keyed off `after` + `offset` and is only
   * relevant when a server-side `sort` is active.
   */
  pageNumber?: number;
  after?: string;
  /** Forward offset (in *rows*) to apply on top of `after`. */
  offset?: number;
  where?: WhereCondition;
  sort?: { propertyId: string; direction: 'asc' | 'desc'; dataType?: string };
}

export function useCollection({ source, first, pageNumber = 0, after, offset, where, sort }: CollectionProps) {
  const { entityId, spaceId } = useDataBlockInstance();

  const { initialBlockEntities, initialCollectionItems } = useEditorStoreLite();
  const initialBlockEntity = initialBlockEntities.find(b => b.id === entityId) ?? null;

  const { entity: blockEntity } = useQueryEntity({
    spaceId,
    id: entityId,
    enabled: source.type === 'COLLECTION',
  });

  const effectiveEntity = blockEntity ?? initialBlockEntity;

  const collectionRelations =
    source.type === 'COLLECTION'
      ? (effectiveEntity?.relations.filter(
          r => r.fromEntity.id === source.value && r.type.id === SystemIds.COLLECTION_ITEM_RELATION_TYPE
        ) ?? [])
      : [];

  const deduplicatedRelations = deduplicateRelationsByEntityId(collectionRelations);

  const orderedCollectionRelations = deduplicatedRelations.sort((a, z) => {
    return Position.compare(a.position ?? null, z.position ?? null);
  });

  // When filters are present, we need to fetch ALL collection items first,
  // apply the filter, then paginate the filtered results.
  // When sort is active, we fetch ALL IDs but let the server sort + paginate.
  const hasFilters = where && Object.keys(where).length > 0;

  const allEntityIds = orderedCollectionRelations.map(r => r.toEntity.id);
  const pageSize = first ?? 9;
  const skip = pageNumber * pageSize;

  const entityIdsToFetch =
    hasFilters || sort
      ? allEntityIds
      : orderedCollectionRelations.slice(skip, skip + pageSize).map(r => r.toEntity.id);

  const collectionItemsWhere: WhereCondition = {
    id: {
      in: entityIdsToFetch,
    },
    ...(where ?? {}),
  };

  // For sorted collections we drive the network call with the cursor + offset
  // for the current page. For unsorted/no-filter the slice above already
  // narrows the id-set to the active window so we just ask for all of those
  // rows in a single request.
  const {
    entities: collectionItems,
    isLoading: isCollectionItemsLoading,
    isPlaceholderData: isCollectionItemsPlaceholder,
    endCursor,
    hasNextPage,
  } = useQueryEntities({
    enabled: entityIdsToFetch.length > 0,
    where: collectionItemsWhere,
    first: sort ? pageSize : entityIdsToFetch.length || undefined,
    after: sort ? after : undefined,
    offset: sort ? offset : undefined,
    placeholderData: keepPreviousData,
    sort,
  });

  const { entities: localCollectionItemsFallback } = useQueryEntities({
    enabled: source.type === 'COLLECTION' && Boolean(sort) && !hasFilters && entityIdsToFetch.length > 0,
    where: {
      id: {
        in: entityIdsToFetch,
      },
    },
    first: entityIdsToFetch.length || undefined,
    placeholderData: keepPreviousData,
  });

  const filteredRelations = hasFilters
    ? deduplicateRelationsByEntityId(
        orderedCollectionRelations.filter(r => collectionItems.some(item => item.id === r.toEntity.id))
      )
    : orderedCollectionRelations;

  const pageStartIndex = skip;
  const pageEndIndex = pageStartIndex + pageSize;
  const paginatedRelations = hasFilters ? filteredRelations.slice(pageStartIndex, pageEndIndex) : filteredRelations;

  // When sort is active, the server already returned items in the right order and page.
  // Use the server-returned order directly instead of re-ordering by position.
  const collectionItemsMap = new Map(collectionItems.map(item => [item.id, item]));

  const orderedCollectionItems = sort
    ? collectionItems
    : paginatedRelations
        .map(relation => collectionItemsMap.get(relation.toEntity.id))
        .filter(item => item !== undefined);

  const relationFallbackItems: Entity[] = React.useMemo(
    () =>
      paginatedRelations.map(relation => ({
        id: relation.toEntity.id,
        name: relation.toEntity.name,
        description: null,
        spaces: relation.toSpaceId ? [relation.toSpaceId] : [],
        types: [],
        relations: [],
        values: [],
      })),
    [paginatedRelations]
  );

  const lastVisibleCollectionItemsRef = React.useRef<typeof orderedCollectionItems>([]);
  React.useEffect(() => {
    if (orderedCollectionItems.length > 0) {
      lastVisibleCollectionItemsRef.current = orderedCollectionItems;
    }
  }, [orderedCollectionItems]);

  // When sort is active, build relations matching the server-returned item order
  // so that downstream features (drag-and-drop, position tracking) still work.
  const sortedRelations = sort
    ? collectionItems
        .map(item => deduplicatedRelations.find(r => r.toEntity.id === item.id))
        .filter(r => r !== undefined)
    : paginatedRelations;

  const ssrItems = initialCollectionItems[entityId];
  const isFirstPage = skip === 0;
  const canUseSSRFallback = ssrItems && ssrItems.length > 0 && isFirstPage && !hasFilters;
  const shouldFallbackToSSR = canUseSSRFallback && orderedCollectionItems.length === 0 && isCollectionItemsLoading;
  const shouldFallbackToLocalCollectionItems =
    Boolean(sort) && !hasFilters && orderedCollectionItems.length === 0 && localCollectionItemsFallback.length > 0;
  const shouldFallbackToLastVisibleCollectionItems =
    Boolean(sort) &&
    !hasFilters &&
    orderedCollectionItems.length === 0 &&
    localCollectionItemsFallback.length === 0 &&
    lastVisibleCollectionItemsRef.current.length > 0;
  const shouldFallbackToRelationItems =
    Boolean(sort) &&
    !hasFilters &&
    orderedCollectionItems.length === 0 &&
    localCollectionItemsFallback.length === 0 &&
    lastVisibleCollectionItemsRef.current.length === 0 &&
    relationFallbackItems.length > 0;

  const items = (() => {
    if (shouldFallbackToSSR) return ssrItems;
    if (shouldFallbackToLocalCollectionItems) return localCollectionItemsFallback;
    if (shouldFallbackToLastVisibleCollectionItems) return lastVisibleCollectionItemsRef.current;
    if (shouldFallbackToRelationItems) return relationFallbackItems;
    return orderedCollectionItems;
  })();
  const hasData = items.length > 0;

  const filterSuggestionEntityIds =
    source.type === 'COLLECTION'
      ? hasFilters
        ? filteredRelations.map(r => r.toEntity.id)
        : orderedCollectionRelations.map(r => r.toEntity.id)
      : undefined;

  return {
    collectionItems: items,
    collectionRelations:
      shouldFallbackToSSR ||
      shouldFallbackToLocalCollectionItems ||
      shouldFallbackToLastVisibleCollectionItems ||
      shouldFallbackToRelationItems
        ? paginatedRelations
        : sortedRelations,
    isLoading: hasData ? false : isCollectionItemsLoading,
    isFetched: hasData ? true : !isCollectionItemsLoading,
    collectionLength: hasFilters ? filteredRelations.length : collectionRelations.length,
    filterSuggestionEntityIds,
    endCursor,
    hasNextPage,
    isPlaceholderData: isCollectionItemsPlaceholder,
  };
}
