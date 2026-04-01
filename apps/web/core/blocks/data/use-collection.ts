import { Position, SystemIds } from '@geoprotocol/geo-sdk';
import { keepPreviousData } from '@tanstack/react-query';

import { useEditorStoreLite } from '~/core/state/editor/use-editor';
import { WhereCondition } from '~/core/sync/experimental_query-layer';
import { useQueryEntities, useQueryEntity } from '~/core/sync/use-store';
import { Relation } from '~/core/types';

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
  skip?: number;
  where?: WhereCondition;
  sort?: { propertyId: string; direction: 'asc' | 'desc'; dataType?: string };
}

export function useCollection({ source, first, skip, where, sort }: CollectionProps) {
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

  const entityIdsToFetch =
    hasFilters || sort
      ? allEntityIds
      : orderedCollectionRelations.slice(skip || 0, (skip || 0) + (first || 9)).map(r => r.toEntity.id);

  const collectionItemsWhere: WhereCondition = {
    id: {
      in: entityIdsToFetch,
    },
    ...(where ?? {}),
  };

  const { entities: collectionItems, isLoading: isCollectionItemsLoading } = useQueryEntities({
    enabled: entityIdsToFetch.length > 0,
    where: collectionItemsWhere,
    first: sort ? first || 9 : entityIdsToFetch.length || undefined,
    skip: sort ? skip || 0 : undefined,
    placeholderData: keepPreviousData,
    sort,
  });

  const filteredRelations = hasFilters
    ? deduplicateRelationsByEntityId(
        orderedCollectionRelations.filter(r => collectionItems.some(item => item.id === r.toEntity.id))
      )
    : orderedCollectionRelations;

  const pageStartIndex = skip || 0;
  const pageEndIndex = pageStartIndex + (first || 9);
  const paginatedRelations = hasFilters ? filteredRelations.slice(pageStartIndex, pageEndIndex) : filteredRelations;

  // When sort is active, the server already returned items in the right order and page.
  // Use the server-returned order directly instead of re-ordering by position.
  const collectionItemsMap = new Map(collectionItems.map(item => [item.id, item]));

  const orderedCollectionItems = sort
    ? collectionItems
    : paginatedRelations
        .map(relation => collectionItemsMap.get(relation.toEntity.id))
        .filter(item => item !== undefined);

  // When sort is active, build relations matching the server-returned item order
  // so that downstream features (drag-and-drop, position tracking) still work.
  const sortedRelations = sort
    ? collectionItems
        .map(item => deduplicatedRelations.find(r => r.toEntity.id === item.id))
        .filter(r => r !== undefined)
    : paginatedRelations;

  const ssrItems = initialCollectionItems[entityId];
  const isFirstPage = (skip || 0) === 0;
  const canUseSSRFallback = ssrItems && ssrItems.length > 0 && isFirstPage && !hasFilters && !sort;
  const shouldFallbackToSSR = canUseSSRFallback && orderedCollectionItems.length === 0 && isCollectionItemsLoading;

  const items = shouldFallbackToSSR ? ssrItems : orderedCollectionItems;
  const hasData = items.length > 0;

  const filterSuggestionEntityIds =
    source.type === 'COLLECTION'
      ? hasFilters
        ? filteredRelations.map(r => r.toEntity.id)
        : orderedCollectionRelations.map(r => r.toEntity.id)
      : undefined;

  return {
    collectionItems: items,
    collectionRelations: sortedRelations,
    isLoading: hasData ? false : isCollectionItemsLoading,
    isFetched: hasData ? true : !isCollectionItemsLoading,
    collectionLength: hasFilters ? filteredRelations.length : collectionRelations.length,
    filterSuggestionEntityIds,
  };
}
