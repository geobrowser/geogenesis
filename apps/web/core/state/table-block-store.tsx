import { SYSTEM_IDS } from '@geogenesis/sdk';
import { keepPreviousData, useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { Filter } from '../blocks/data/filters';
import {
  MergeTableEntitiesArgs,
  RelationRow,
  mergeColumns,
  mergeEntitiesAsync,
  mergeRelationQueryEntities,
  mergeTableEntities,
} from '../blocks/data/queries';
import { Source } from '../blocks/data/source';
import { useCollection } from '../blocks/data/use-collection';
import { useFilters } from '../blocks/data/use-filters';
import { usePagination } from '../blocks/data/use-pagination';
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

type DataRows =
  | {
      type: 'ENTITIES' | 'COLLECTION';
      data: Entity[];
    }
  | {
      type: 'RELATIONS';
      data: RelationRow[];
    };

export function useTableBlock() {
  const { entityId, spaceId } = useTableBlockInstance();
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

  const { collectionItems } = useCollection();
  const { view, placeholder, shownColumnIds } = useView();

  const {
    data: entities,
    isLoading: isLoadingEntities,
    isFetched: isEntitiesFetched,
  } = useQuery<DataRows>({
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
      if (!filterState)
        return {
          type: 'ENTITIES',
          data: [],
        };

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
       *
       * @QUESTION Should we combine aggregating all the dependencies needed before mapping
       * to Row[] into a single function? Then this function gets called depending
       * on the query mode and view?
       * 1. Fetch data for query mode
       * 2. Fetch data about each "field" (e.g., column, name, etc.) in the mapping
       * 3. Process the data to the layout of the view
       *
       * @TODO We need to turn this hook into a FSM depending on the view and query mode.
       * This will help do data processing correctly by abstracting logic logically (lol).
       */

      if (source.type === 'SPACES' || source.type === 'GEO') {
        const data = await mergeTableEntities({ options: params, filterState });

        return {
          type: 'ENTITIES',
          data,
        };
      }

      if (source.type === 'COLLECTION') {
        const data = await mergeEntitiesAsync({
          entityIds: collectionItems.map(c => c.id),
          filterState,
        });

        return {
          type: 'COLLECTION',
          data,
        };
      }

      if (source.type === 'RELATIONS') {
        const data = await mergeRelationQueryEntities(source.value, filterState);
        return {
          type: 'RELATIONS',
          data,
        };
      }

      return {
        type: 'ENTITIES',
        data: [],
      };
    },
  });

  // @TODO: This should be renamed to "DataFields" or something. Should also
  // depend on the mapping rather than selected types.
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

  // @TODO: This can be unique to the query mode, so each query mode
  // processes and returns data depending on the query mode. This also
  // lets us turn the returned data into a FSM.
  const rows = React.useMemo(() => {
    if (!entities || !columns) return [];
    if (entities.type === 'RELATIONS') return [];
    return EntityTable.fromColumnsAndRows(entities.data, columns, collectionItems);
  }, [entities, columns, collectionItems]);

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
    shownColumnIds,
    placeholder,
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
