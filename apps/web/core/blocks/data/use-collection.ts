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
}

export function useCollection({ source, first, skip, where }: CollectionProps) {
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
  // apply the filter, then paginate the filtered results
  const hasFilters = where && Object.keys(where).length > 0;

  const entityIdsToFetch = hasFilters
    ? orderedCollectionRelations.map(r => r.toEntity.id)
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
    first: entityIdsToFetch.length || undefined,
    placeholderData: keepPreviousData,
  });

  const filteredRelations = hasFilters
    ? deduplicateRelationsByEntityId(
        orderedCollectionRelations.filter(r => collectionItems.some(item => item.id === r.toEntity.id))
      )
    : orderedCollectionRelations;

  const pageStartIndex = skip || 0;
  const pageEndIndex = pageStartIndex + (first || 9);
  const paginatedRelations = hasFilters ? filteredRelations.slice(pageStartIndex, pageEndIndex) : filteredRelations;

  // The sync engine doesn't guarantee ordering for `id: { in: [...] }` queries,
  // so we re-order using the relations as the source of truth.
  const collectionItemsMap = new Map(collectionItems.map(item => [item.id, item]));

  const orderedCollectionItems = paginatedRelations
    .map(relation => {
      const entity = collectionItemsMap.get(relation.toEntity.id);
      return entity;
    })
    .filter(item => item !== undefined);

  const ssrItems = initialCollectionItems[entityId];
  const isFirstPage = (skip || 0) === 0;
  const canUseSSRFallback = ssrItems && ssrItems.length > 0 && isFirstPage && !hasFilters;
  const shouldFallbackToSSR = canUseSSRFallback && orderedCollectionItems.length === 0 && isCollectionItemsLoading;

  const items = shouldFallbackToSSR ? ssrItems : orderedCollectionItems;
  const hasData = items.length > 0;

  return {
    collectionItems: items,
    collectionRelations: paginatedRelations,
    isLoading: hasData ? false : isCollectionItemsLoading,
    isFetched: hasData ? true : !isCollectionItemsLoading,
    collectionLength: hasFilters ? filteredRelations.length : collectionRelations.length,
  };
}
