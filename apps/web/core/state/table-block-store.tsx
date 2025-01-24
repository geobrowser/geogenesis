import { SYSTEM_IDS } from '@geogenesis/sdk';
import { keepPreviousData, useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { Filter } from '../blocks/data/filters';
import { MergeTableEntitiesArgs, mergeColumns, mergeEntitiesAsync, mergeTableEntities } from '../blocks/data/queries';
import { Source } from '../blocks/data/source';
import { useCollection } from '../blocks/data/use-collection';
import { useFilters } from '../blocks/data/use-filters';
import { usePagination } from '../blocks/data/use-pagination';
import { useRelationsQueryBlock } from '../blocks/data/use-relation-block';
import { useSource } from '../blocks/data/use-source';
import { useView } from '../blocks/data/use-view';
import { useEntity } from '../database/entities';
import { upsert } from '../database/write';
import { usePropertyValueTypes } from '../hooks/use-property-value-types';
import { Entity } from '../io/dto/entities';
import { EntityId, SpaceId } from '../io/schema';
import { PropertySchema } from '../types';
import { EntityTable } from '../utils/entity-table';

export const PAGE_SIZE = 9;

interface RowQueryArgs {
  pageNumber: number;
  entityId: string;
  filterState?: Filter[];
  source: Source;
  collectionItems: Entity[];
}

const queryKeys = {
  collectionItemEntities: (collectionItemIds: EntityId[]) =>
    ['blocks', 'data', 'collection-items', collectionItemIds] as const,
  columns: (filterState: Filter[] | null) => ['blocks', 'data', 'columns', filterState] as const,
  rows: (args: RowQueryArgs) => ['blocks', 'data', 'rows', args],
  columnsSchema: (columns?: PropertySchema[]) => ['blocks', 'data', 'columns-schema', columns],
};

export function useTableBlock() {
  const { entityId, spaceId, relationId } = useTableBlockInstance();
  const { pageNumber, setPage } = usePagination();

  const blockEntity = useEntity({
    spaceId: React.useMemo(() => SpaceId(spaceId), [spaceId]),
    id: React.useMemo(() => EntityId(entityId), [entityId]),
  });

  const {
    filterState,
    isLoading: isLoadingFilterState,
    isFetched: isFilterStateFetched,
    setFilterState,
  } = useFilters();

  const { source, setSource } = useSource();
  /**
   * @TODO We need to turn this hook into a FSM depending on the view and query mode.
   * This will help do data processing correctly.
   *
   *
   */
  const { collectionItems } = useCollection();
  const { data: relationsQueryData } = useRelationsQueryBlock();
  const { view, placeholder, shownColumnRelations, shownColumnIds } = useView();

  // @TODO: The columns or "layout" should be dependent on the view + mapping
  const {
    data: columns,
    isLoading: isLoadingColumns,
    isFetched: isColumnsFetched,
  } = useQuery({
    enabled: filterState !== undefined,
    placeholderData: keepPreviousData,
    queryKey: queryKeys.columns(filterState ?? null),
    queryFn: async () => {
      const typesInFilter = filterState?.filter(f => f.columnId === SYSTEM_IDS.TYPES_ATTRIBUTE).map(f => f.value) ?? [];
      return await mergeColumns(typesInFilter);
    },
  });

  const {
    data: tableEntities,
    isLoading: isLoadingEntities,
    isFetched: isEntitiesFetched,
  } = useQuery({
    enabled: filterState !== undefined && source.type !== 'RELATIONS',
    placeholderData: keepPreviousData,
    // @TODO: Should re-run when the relations for the entity source changes
    queryKey: queryKeys.rows({
      pageNumber,
      collectionItems,
      entityId,
      source,
      filterState,
    }),
    queryFn: async () => {
      if (!filterState) return [];

      const params: MergeTableEntitiesArgs['options'] = {
        first: PAGE_SIZE + 1,
        skip: pageNumber * PAGE_SIZE,
      };

      /**
       * Data should be returned in the mapped format. Kinda blocked until we
       * can mock/implement that.
       *
       * We could also just return the data for both the `this` and `to` entities
       * in the row format. There just might be more than one "cell" for a given
       * attribute id. We'll have to match the entity _and_ the attribute.
       *
       * We can't use this entity -> attribute -> value data structure because
       * the mapping isn't aware of concrete values, only relative shapes.
       *
       * We need to somehow store data in a concrete form that can be read using
       * the relative shape. The `this` entity and `to` entity does this, but
       * `this` and `to` needs to be mapped into the concrete form.
       *
       * Current we have a {@link Row} data structure. This represents a single
       * row with a Record of column id -> {@link Cell} data. The column id represents
       * the UI "slot" to render the Cell data into. We can use this same concept
       * to represent the UI mapping, where instead of column id, it's layout id
       * or something like that.
       *
       * ---------------------------------------------------------------------------
       *
       * Each query mode + view maps data to the same layout. It's a data processing
       * pipeline where we need to do a few steps.
       * 1. Fetch the data for each query mode. Collections and entities queries fetch
       *    only the data for a single entity for each row. Relations queries fetch
       *    data for two entities for each row: The relation entity and the to entity.
       * 2. Process which fields should exist on a {@link Row} based on the view and
       *    the query mode. This step reads from the Mapping.
       * 3. Returns the list of {@link Row} data structures.
       */

      if (source.type === 'SPACES' || source.type === 'GEO') {
        return await mergeTableEntities({ options: params, filterState });
      }

      if (source.type === 'COLLECTION') {
        return mergeEntitiesAsync({
          entityIds: collectionItems.map(c => c.id),
          filterState,
        });
      }

      // if (source.type === 'RELATIONS') {
      //   return await mergeRelationQueryEntities(source.value, filterState);
      // }

      return [];
    },
  });

  const rows = React.useMemo(() => {
    if (!tableEntities || !columns) return [];
    return EntityTable.fromColumnsAndRows(tableEntities, columns, collectionItems);
  }, [tableEntities, columns, collectionItems]);

  const { propertyValueTypes: columnsSchema } = usePropertyValueTypes(columns ? columns.map(c => c.id) : []);

  const setName = React.useCallback(
    (newName: string) => {
      upsert(
        {
          attributeId: SYSTEM_IDS.NAME_ATTRIBUTE,
          entityId: entityId,
          entityName: newName,
          attributeName: 'Name',
          value: { type: 'TEXT', value: newName },
        },
        spaceId
      );
    },
    [entityId, spaceId]
  );

  return {
    blockEntity,
    relationId,
    source,
    setSource,

    rows: rows?.slice(0, PAGE_SIZE) ?? [],
    columns: columns ?? [],

    columnRelationTypes: {},

    filterState: filterState ?? [],
    setFilterState,

    pageNumber,
    hasNextPage: rows ? rows?.length > PAGE_SIZE : false,
    hasPreviousPage: pageNumber > 0,
    setPage,

    entityId,
    spaceId,

    // We combine fetching state into loading state due to the transition from
    // the server representation of our editor to the client representation. We
    // don't want to transition from a loading state on the server to an empty
    // state then back into a loading state. By adding the isFetched state we
    // will stay in a placeholder state until we've fetched our queries at least
    // one time.
    isLoading:
      isLoadingColumns ||
      isLoadingEntities ||
      isLoadingFilterState ||
      !isFilterStateFetched ||
      !isColumnsFetched ||
      !isEntitiesFetched,

    name: blockEntity.name,
    setName,
    view,
    columnsSchema,
    shownColumnRelations,
    shownColumnIds,
    placeholder,
    collectionItems,
  };
}

const TableBlockContext = React.createContext<{ entityId: string; spaceId: string; relationId: string } | undefined>(
  undefined
);

interface Props {
  spaceId: string;
  children: React.ReactNode;
  entityId: string;
  relationId: string;
}

export function TableBlockProvider({ spaceId, children, entityId, relationId }: Props) {
  const store = React.useMemo(() => {
    return {
      spaceId,
      entityId,
      relationId,
    };
  }, [spaceId, entityId, relationId]);

  return <TableBlockContext.Provider value={store}>{children}</TableBlockContext.Provider>;
}

export function useTableBlockInstance() {
  const value = React.useContext(TableBlockContext);

  if (!value) {
    throw new Error(`Missing EntityPageTableBlockStoreProvider`);
  }

  return value;
}
