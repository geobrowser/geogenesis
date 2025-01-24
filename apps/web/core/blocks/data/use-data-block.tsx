import { SYSTEM_IDS } from '@geogenesis/sdk';
import { keepPreviousData, useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { useEntity } from '../../database/entities';
import { upsert } from '../../database/write';
import { usePropertyValueTypes } from '../../hooks/use-property-value-types';
import { Entity } from '../../io/dto/entities';
import { EntityId, SpaceId } from '../../io/schema';
import { PropertySchema } from '../../types';
import { Filter } from './filters';
import {
  MergeTableEntitiesArgs,
  RelationRow,
  mergeEntitiesAsync,
  mergeRelationQueryEntities,
  mergeSlots,
  mergeTableEntities,
} from './queries';
import { Source } from './source';
import { useCollection } from './use-collection';
import { useFilters } from './use-filters';
import { Mapping, mappingToRows, useMapping } from './use-mapping';
import { usePagination } from './use-pagination';
import { useSource } from './use-source';

export const PAGE_SIZE = 9;

interface RenderablesQueryKey {
  pageNumber: number;
  entityId: string;
  filterState: Filter[];
  source: Source;
  collectionItems: Entity[];
  mapping: Mapping;
}

const queryKeys = {
  renderables: (args: RenderablesQueryKey) => ['blocks', 'data', 'renderables', args],
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

export function useDataBlock() {
  const { entityId, spaceId, pageNumber, setPage } = useDataBlockInstance();

  const blockEntity = useEntity({
    spaceId: React.useMemo(() => SpaceId(spaceId), [spaceId]),
    id: React.useMemo(() => EntityId(entityId), [entityId]),
  });

  const { filterState, isLoading: isLoadingFilterState, isFetched: isFilterStateFetched } = useFilters();
  const { source } = useSource();
  const { collectionItems } = useCollection();
  const { mapping } = useMapping();

  const {
    data: renderables,
    isLoading: isLoadingRenderables,
    isFetched: isRenderablesFetch,
  } = useQuery({
    enabled: filterState !== undefined && source.type !== 'RELATIONS',
    placeholderData: keepPreviousData,
    // @TODO: Should re-run when the relations for the entity source changes
    queryKey: queryKeys.renderables({
      pageNumber,
      collectionItems,
      entityId,
      source,
      filterState,
      mapping,
    }),
    queryFn: async () => {
      // @TODO: Filter state being empty by default means we can end up rendering
      // the table without filters before processing the filter. Should avoid the
      // layout jank if possible.

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

      let rowData: DataRows | null = null;

      // @TODO: Effectify this query hook
      if (source.type === 'SPACES' || source.type === 'GEO') {
        rowData = {
          type: 'ENTITIES',
          data: await mergeTableEntities({ options: params, filterState }),
        };
      }

      if (source.type === 'COLLECTION') {
        rowData = {
          type: 'COLLECTION',
          data: await mergeEntitiesAsync({
            entityIds: collectionItems.map(c => c.id),
            filterState,
          }),
        };
      }

      if (source.type === 'RELATIONS') {
        rowData = {
          type: 'RELATIONS',
          data: await mergeRelationQueryEntities(source.value, filterState),
        };
      }

      if (!rowData) {
        return {
          rows: [],
          columns: [],
        };
      }

      if (rowData.type === 'RELATIONS') {
        return {
          rows: [],
          columns: [],
        };
      }

      const columns = await mergeSlots(Object.keys(mapping));

      console.log('columns', columns);

      const rows = mappingToRows(
        rowData.data,
        columns.map(c => c.id),
        collectionItems
      );

      return {
        rows,
        columns,
      };
    },
  });

  // filterable columns should be based on the schema and not the mapping (?)

  const rows = React.useMemo(() => {
    if (!renderables) return [];
    return renderables.rows;
  }, [renderables]);

  const columns = React.useMemo(() => {
    if (!renderables) return [];
    return renderables.columns;
  }, [renderables]);

  const { propertyValueTypes: columnsSchema } = usePropertyValueTypes(columns.map(c => c.id));

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

    rows: renderables?.rows.slice(0, PAGE_SIZE) ?? [],
    columns: columns ?? [],
    columnRelationTypes: {},

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
    isLoading: isLoadingRenderables || isLoadingFilterState || !isFilterStateFetched || !isRenderablesFetch,

    name: blockEntity.name,
    setName,
    columnsSchema,
  };
}

const DataBlockContext = React.createContext<{
  entityId: string;
  spaceId: string;
  relationId: string;
  pageNumber: number;
  setPage: (page: number | 'next' | 'previous') => void;
} | null>(null);

interface Props {
  spaceId: string;
  children: React.ReactNode;
  entityId: string;
  relationId: string;
}

export function DataBlockProvider({ spaceId, children, entityId, relationId }: Props) {
  const { pageNumber, setPage } = usePagination();

  const store = React.useMemo(() => {
    return {
      spaceId,
      entityId,
      relationId,
      pageNumber,
      setPage,
    };
  }, [spaceId, entityId, relationId, pageNumber, setPage]);

  return <DataBlockContext.Provider value={store}>{children}</DataBlockContext.Provider>;
}

export function useDataBlockInstance() {
  const context = React.useContext(DataBlockContext);

  if (context === null) {
    throw new Error(`Missing EntityPageTableBlockStoreProvider`);
  }

  return context;
}
