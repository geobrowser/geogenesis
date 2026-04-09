'use client';

import { SystemIds } from '@geoprotocol/geo-sdk/lite';
import { keepPreviousData, useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { Filter, FilterMode } from '~/core/blocks/data/filters';
import { useCollection } from '~/core/blocks/data/use-collection';
import { filterStateToWhere, useDataBlock, useDataBlockInstance } from '~/core/blocks/data/use-data-block';
import { useFilters } from '~/core/blocks/data/use-filters';
import { useSource } from '~/core/blocks/data/use-source';
import { useView } from '~/core/blocks/data/use-view';
import { getSchemaFromTypeIds, readTypes } from '~/core/database/entities';
import { useProperties } from '~/core/hooks/use-properties';
import { useQueryEntities, useQueryEntitiesAsync } from '~/core/sync/use-store';
import { Property, Relation } from '~/core/types';

import { PowerToolsData, PowerToolsRow } from '../types';

const DEFAULT_PAGE_SIZE = 25;
// Keep a bounded window in memory to avoid re-render costs after long scroll sessions.
const MAX_PAGES_IN_MEMORY = 6;
const MAX_FETCH_PAGES = 200;

/**
 * SPACES/GEO: upper bound on how many entity ids `fetchAllIds` pulls over the network.
 * `getAllEntities` chunks each GraphQL request to `first` ≤ 1000 (API cap).
 */
const FETCH_ALL_IDS_FIRST = 100_000;

function buildRowMeta(
  entityId: string,
  spaceId: string,
  collectionMeta?: {
    collectionId: string;
    relationId?: string;
    toSpaceId?: string;
    verified?: boolean;
  }
): PowerToolsRow {
  return {
    entityId,
    spaceId,
    collectionId: collectionMeta?.collectionId,
    relationId: collectionMeta?.relationId,
    toSpaceId: collectionMeta?.toSpaceId,
    verified: collectionMeta?.verified,
  };
}

export function usePowerToolsData(options?: {
  pageSize?: number;
  filterStateOverride?: Filter[];
  filterModeOverride?: FilterMode;
  /** Extra column (property) IDs to always show, e.g. newly created properties. */
  extraColumnIds?: string[];
  /** Column (property) IDs to hide from the table, e.g. after "Remove Property". */
  excludedColumnIds?: string[];
  sort?: { propertyId: string; direction: 'asc' | 'desc'; dataType?: string };
}): PowerToolsData & {
  sourceType: string;
  fetchAllIds: () => Promise<string[]>;
} {
  const pageSize = options?.pageSize ?? DEFAULT_PAGE_SIZE;
  const extraColumnIds = options?.extraColumnIds ?? [];
  const excludedColumnIdsSet = React.useMemo(
    () => new Set(options?.excludedColumnIds ?? []),
    [options?.excludedColumnIds]
  );
  const { spaceId } = useDataBlockInstance();
  const { resolvedFilterState, isFilterResolving, filterMode, filterState, setFilterState } = useFilters();
  const { source } = useSource({ filterState, setFilterState });
  const { blockEntity } = useDataBlock();
  const { shownColumnRelations } = useView();

  const effectiveFilterState = options?.filterStateOverride ?? resolvedFilterState;
  const effectiveFilterMode = options?.filterModeOverride ?? filterMode;
  const where = React.useMemo(
    () => filterStateToWhere(effectiveFilterState, effectiveFilterMode),
    [effectiveFilterState, effectiveFilterMode]
  );

  const queryEntitiesAsync = useQueryEntitiesAsync();

  const [page, setPage] = React.useState(0);
  const [loadedEntityPages, setLoadedEntityPages] = React.useState<
    Array<{
      page: number;
      entities: Array<{
        id: string;
        spaces?: string[];
        types?: { id: string; name: string | null }[];
        name?: string | null;
        values?: { property: { id: string } }[];
        relations?: { type: { id: string }; toEntity: { id: string }; spaceId?: string }[];
      }>;
    }>
  >([]);
  const [lastPageCount, setLastPageCount] = React.useState(0);
  const [loadedCollectionRelationPages, setLoadedCollectionRelationPages] = React.useState<
    Array<{
      page: number;
      relations: Relation[];
    }>
  >([]);
  const [columnIds, setColumnIds] = React.useState<string[]>([SystemIds.NAME_PROPERTY]);

  const sourceValue = 'value' in source ? source.value : null;

  const sort = options?.sort;

  const sourceKey = React.useMemo(() => {
    return JSON.stringify({
      type: source.type,
      value: sourceValue,
      where,
      sort,
    });
  }, [source.type, sourceValue, where, sort]);

  React.useEffect(() => {
    setPage(0);
    setLoadedEntityPages([]);
    setLastPageCount(0);
    setLoadedCollectionRelationPages([]);
    setColumnIds([SystemIds.NAME_PROPERTY]);
  }, [sourceKey]);

  const loadedEntities = React.useMemo(() => {
    return loadedEntityPages.flatMap(page => page.entities);
  }, [loadedEntityPages]);

  const loadedCollectionRelations = React.useMemo(() => {
    return loadedCollectionRelationPages.flatMap(page => page.relations);
  }, [loadedCollectionRelationPages]);

  const sameItemsById = React.useCallback(<T extends { id?: string }>(prevItems: T[], nextItems: T[]) => {
    if (prevItems.length !== nextItems.length) return false;
    for (let i = 0; i < prevItems.length; i += 1) {
      if (prevItems[i]?.id !== nextItems[i]?.id) return false;
    }
    return true;
  }, []);

  const upsertEntityPage = React.useCallback(
    (prev: typeof loadedEntityPages, nextPage: number, nextItems: (typeof loadedEntityPages)[number]['entities']) => {
      const existing = prev.find(page => page.page === nextPage);
      if (existing && sameItemsById(existing.entities, nextItems)) {
        return prev;
      }
      const trimmed = prev.filter(page => page.page !== nextPage);
      trimmed.push({ page: nextPage, entities: nextItems });
      trimmed.sort((a, b) => a.page - b.page);
      if (Number.isFinite(MAX_PAGES_IN_MEMORY) && trimmed.length > MAX_PAGES_IN_MEMORY) {
        trimmed.splice(0, trimmed.length - MAX_PAGES_IN_MEMORY);
      }
      return trimmed;
    },
    [sameItemsById]
  );

  const upsertRelationPage = React.useCallback(
    (prev: typeof loadedCollectionRelationPages, nextPage: number, nextItems: Relation[]) => {
      const existing = prev.find(page => page.page === nextPage);
      if (existing && sameItemsById(existing.relations, nextItems)) {
        return prev;
      }
      const trimmed = prev.filter(page => page.page !== nextPage);
      trimmed.push({ page: nextPage, relations: nextItems });
      trimmed.sort((a, b) => a.page - b.page);
      if (Number.isFinite(MAX_PAGES_IN_MEMORY) && trimmed.length > MAX_PAGES_IN_MEMORY) {
        trimmed.splice(0, trimmed.length - MAX_PAGES_IN_MEMORY);
      }
      return trimmed;
    },
    [sameItemsById]
  );

  const {
    collectionItems,
    collectionRelations,
    isLoading: isCollectionLoading,
    collectionLength,
  } = useCollection({
    source,
    first: pageSize,
    skip: page * pageSize,
    where,
    sort,
  });

  const { entities: queriedEntities, isLoading: isQueryLoading } = useQueryEntities({
    where,
    first: pageSize,
    skip: page * pageSize,
    enabled: source.type === 'SPACES' || source.type === 'GEO',
    placeholderData: keepPreviousData,
    sort,
  });

  React.useEffect(() => {
    if (source.type === 'COLLECTION') {
      if (!collectionItems) return;
      setLoadedEntityPages(prev => upsertEntityPage(prev, page, collectionItems));
      setLastPageCount(collectionItems.length);
      if (collectionRelations && collectionRelations.length > 0) {
        setLoadedCollectionRelationPages(prev => upsertRelationPage(prev, page, collectionRelations));
      }
    }
    // sourceKey: re-fire after reset clears pages
  }, [collectionItems, collectionRelations, source.type, page, upsertEntityPage, upsertRelationPage, sourceKey]);

  React.useEffect(() => {
    if (source.type === 'SPACES' || source.type === 'GEO') {
      if (!queriedEntities) return;
      setLoadedEntityPages(prev => upsertEntityPage(prev, page, queriedEntities));
      setLastPageCount(queriedEntities.length);
    }
    // sourceKey: re-fire after reset clears pages
  }, [queriedEntities, source.type, page, upsertEntityPage, sourceKey]);

  const rows = React.useMemo(() => {
    if (source.type === 'COLLECTION') {
      const relationByEntityId = new Map<string, Relation>();
      for (const relation of loadedCollectionRelations) {
        relationByEntityId.set(relation.toEntity.id, relation);
      }

      return loadedEntities.map(entity => {
        const relation = relationByEntityId.get(entity.id);
        const rowSpaceId = relation?.toSpaceId ?? entity.spaces?.[0] ?? spaceId;
        return buildRowMeta(entity.id, rowSpaceId, {
          collectionId: source.value,
          relationId: relation?.id,
          toSpaceId: relation?.toSpaceId,
          verified: relation?.verified,
        });
      });
    }

    if (source.type === 'SPACES' || source.type === 'GEO') {
      return loadedEntities.map(entity => {
        const rowSpaceId = entity.spaces?.[0] ?? spaceId;
        return buildRowMeta(entity.id, rowSpaceId);
      });
    }

    return [];
  }, [loadedEntities, loadedCollectionRelations, source.type, sourceValue, spaceId]);

  const loadMore = React.useCallback(() => {
    setPage(prev => prev + 1);
  }, []);

  const hasMore = React.useMemo(() => {
    if (source.type === 'COLLECTION') {
      return (page + 1) * pageSize < (collectionLength ?? 0);
    }

    if (source.type === 'SPACES' || source.type === 'GEO') {
      return lastPageCount >= pageSize;
    }

    return false;
  }, [source.type, page, pageSize, collectionLength, lastPageCount]);

  const allEntityIds = React.useMemo(() => rows.map(row => row.entityId), [rows]);

  const discoveredPropertyIds = React.useMemo(() => {
    const ids = new Set<string>();
    for (const entity of loadedEntities) {
      for (const value of entity.values ?? []) {
        ids.add(value.property.id);
      }
      for (const relation of entity.relations ?? []) {
        ids.add(relation.type.id);
      }
    }
    return ids;
  }, [loadedEntities]);

  const propertyIdSet = React.useMemo(() => {
    const ids = new Set<string>();
    ids.add(SystemIds.NAME_PROPERTY);

    for (const relation of shownColumnRelations) {
      ids.add(relation.toEntity.id);
    }

    for (const id of discoveredPropertyIds) {
      ids.add(id);
    }

    return ids;
  }, [shownColumnRelations, discoveredPropertyIds]);

  const typeIds = React.useMemo(() => {
    const ids = new Map<string, { id: string; spaceId?: string }>();

    for (const entity of loadedEntities) {
      for (const t of entity.types ?? []) {
        if (!ids.has(t.id)) {
          ids.set(t.id, { id: t.id });
        }
      }
      const relations = entity.relations ?? [];
      const types = relations
        .filter(r => r.type.id === SystemIds.TYPES_PROPERTY)
        .map(r => ({ id: r.toEntity.id, name: null as string | null }));
      for (const t of types) {
        if (!ids.has(t.id)) {
          const spaceIdForType = relations.find(
            (r: { toEntity: { id: string }; spaceId?: string }) => r.toEntity.id === t.id
          )?.spaceId;
          ids.set(t.id, { id: t.id, spaceId: spaceIdForType });
        }
      }
    }

    return Array.from(ids.values());
  }, [loadedEntities]);

  const { data: schemaProperties } = useQuery({
    enabled: typeIds.length > 0,
    queryKey: ['power-tools-schema', typeIds],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      return await getSchemaFromTypeIds(typeIds);
    },
  });

  const arraysEqual = React.useCallback((a: string[], b: string[]) => {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }, []);

  React.useEffect(() => {
    const next = [...columnIds];
    const known = new Set(columnIds);

    for (const id of extraColumnIds) {
      if (!known.has(id)) {
        known.add(id);
        next.push(id);
      }
    }

    for (const id of propertyIdSet) {
      if (!known.has(id)) {
        known.add(id);
        next.push(id);
      }
    }

    for (const property of schemaProperties ?? []) {
      if (!known.has(property.id)) {
        known.add(property.id);
        next.push(property.id);
      }
    }

    const filtered = excludedColumnIdsSet.size > 0 ? next.filter(id => !excludedColumnIdsSet.has(id)) : next;

    if (!arraysEqual(filtered, columnIds)) {
      setColumnIds(filtered);
    }
  }, [extraColumnIds, excludedColumnIdsSet, propertyIdSet, schemaProperties, columnIds, arraysEqual]);

  const propertiesById = useProperties(columnIds);
  const properties = React.useMemo(() => Object.values(propertiesById), [propertiesById]);

  const isLoading = source.type === 'COLLECTION' ? isCollectionLoading : isQueryLoading;
  const isInitialLoading = isFilterResolving || (isLoading && rows.length === 0);

  const fetchAllIds = React.useCallback(async () => {
    if (source.type === 'COLLECTION') {
      // When filters are active, use queryEntitiesAsync to match against the filter.
      const relations =
        blockEntity?.relations?.filter(
          r => r.fromEntity.id === source.value && r.type.id === SystemIds.COLLECTION_ITEM_RELATION_TYPE
        ) ?? [];
      const candidateIds = relations.map(r => r.toEntity.id);

      if (candidateIds.length === 0) return [];

      if (!where || Object.keys(where).length === 0) {
        return candidateIds;
      }

      const matching = await queryEntitiesAsync({
        where: {
          id: { in: candidateIds },
          ...where,
        },
        first: candidateIds.length,
        skip: 0,
      });

      return matching.map(entity => entity.id);
    }

    if (source.type === 'SPACES' || source.type === 'GEO') {
      const pageResults = await queryEntitiesAsync({
        where,
        first: FETCH_ALL_IDS_FIRST,
        skip: 0,
      });
      return pageResults.map(entity => entity.id);
    }

    return [];
  }, [source.type, sourceValue, blockEntity?.relations, where, pageSize, queryEntitiesAsync]);

  return {
    rows,
    properties,
    propertiesById,
    isLoading,
    isInitialLoading,
    hasMore,
    loadMore,
    totalCount: source.type === 'COLLECTION' ? collectionLength : undefined,
    allEntityIds,
    sourceType: source.type,
    fetchAllIds,
  };
}
