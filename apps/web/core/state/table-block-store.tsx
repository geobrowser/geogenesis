import { SYSTEM_IDS } from '@geogenesis/ids';
import { useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { TableBlockSdk } from '../blocks-sdk';
import { useActionsStore } from '../hooks/use-actions-store';
import { useMergedData } from '../hooks/use-merged-data';
import { ID } from '../id';
import { FetchRowsOptions } from '../io/fetch-rows';
import { Services } from '../services';
import { Column, EntityValue, GeoType, TripleValueType } from '../types';
import { Entity } from '../utils/entity';
import { Triple } from '../utils/triple';
import { Value } from '../utils/value';

export const PAGE_SIZE = 10;

export interface TableBlockFilter {
  columnId: string;
  valueType: TripleValueType;
  value: string;
  valueName: string | null;
}

export function useTableBlock() {
  const { entityId, selectedType, spaceId } = useTableBlockInstance();
  const [pageNumber, setPageNumber] = React.useState(0);
  const { subgraph } = Services.useServices();

  const merged = useMergedData();
  const { allActions, create, update } = useActionsStore();

  // We need to track local changes to the entity and re-fetch it when
  // any changes occur. We re-fetch instead of deriving the new entity
  // since not all of the triples for an entity will be part of the
  // actions store.
  //
  // Typicall the block will re-render if changes are made to _any_
  // triple on the block entity. This works mostly as intended except
  // when making changes to the name triple.
  //
  // We track the actions minus the name triple so we can avoid re-fetching
  // the entire block entity again when the name changes as changes to
  // the name triple should not affect any of the data fetching.
  const actionsForEntityId = React.useMemo(() => {
    return Entity.actionsForEntityId(allActions, entityId);
  }, [allActions, entityId]);

  const actionsForEntityIdWithoutName = React.useMemo(() => {
    return actionsForEntityId.filter(a => {
      switch (a.type) {
        case 'createTriple':
        case 'deleteTriple':
          return a.attributeId !== SYSTEM_IDS.NAME;
        case 'editTriple':
          return a.after.attributeId !== SYSTEM_IDS.NAME;
      }
    });
  }, [actionsForEntityId]);

  // We only re-fetch the block entity when actions besides changes
  // to the name triple happen. This is so we can avoid re-fetching
  // when we change the name triple as it shouldn't affect any of
  // the data fetching.
  const { data: blockEntity, isLoading } = useQuery({
    // Refetch the entity if there have been local changes
    queryKey: ['table-block-entity', entityId, actionsForEntityIdWithoutName],
    queryFn: ({ signal }) => merged.fetchEntity({ id: entityId, signal }),
  });

  // We track the name triple separately from the normal `blockEntities.triples`
  // flow so we can avoid re-rendering the block when the name changes.
  // 1. Get the initial version of the name triple if it exists. This triple can
  //    either be local or remote as we merge the local and remote triples when
  //    fetching the blockEntity.
  // 2. Since we only merge the local and remote triples when non-name triples
  //    have changed, we need to merge these with the local actions to get any
  //    up-to-date version of the name triple.
  // 3. fromActions takes _all_ the actions on the entity, so we need to filter
  //    again for the name triple. We could do this up-front as well, but the
  //    current implementation fewer data structures.
  const nameTriple = React.useMemo(() => {
    const maybeNameTriple = blockEntity?.triples.find(t => t.attributeId === SYSTEM_IDS.NAME);
    const mergedTriples = Triple.fromActions(actionsForEntityId, maybeNameTriple ? [maybeNameTriple] : []);
    return mergedTriples.find(t => t.attributeId === SYSTEM_IDS.NAME) ?? null;
  }, [blockEntity?.triples, actionsForEntityId]);

  const filterTriple = React.useMemo(() => {
    return blockEntity?.triples.find(t => t.attributeId === SYSTEM_IDS.FILTER) ?? null;
  }, [blockEntity?.triples]);

  // We memoize the filterString since several of the subsequent queries rely
  // on the graphql representation of the filter. Memoizing it means we avoid
  // unnecessary re-renders.
  const filterString = React.useMemo(() => {
    const stringValue = Value.stringValue(filterTriple ?? undefined);

    if (stringValue && stringValue !== '') {
      return stringValue;
    }

    return TableBlockSdk.createGraphQLStringFromFiltersV2([], selectedType.entityId);
  }, [filterTriple, selectedType.entityId]);

  const { data: filterState, isLoading: isLoadingFilterState } = useQuery({
    queryKey: ['table-block-filter-value', filterString],
    queryFn: async () => {
      const filterState = TableBlockSdk.createFiltersFromGraphQLString(
        filterString,
        async id => await merged.fetchEntity({ id })
      );

      return filterState;
    },
  });

  const { data: columns, isLoading: isLoadingColumns } = useQuery({
    // @TODO: ShownColumns changes should trigger a refetch
    queryKey: ['table-block-columns', filterState, selectedType.entityId, entityId],
    queryFn: async ({ signal }) => {
      const filterString = TableBlockSdk.createGraphQLStringFromFiltersV2(filterState ?? [], selectedType.entityId);

      const params: FetchRowsOptions['params'] = {
        filter: filterString,
        typeIds: [selectedType.entityId],
        first: PAGE_SIZE + 1,
        skip: pageNumber * PAGE_SIZE,
      };

      /**
       * Aggregate columns from local and server columns.
       */
      const columns = await merged.columns({
        api: {
          fetchEntity: subgraph.fetchEntity,
          fetchTriples: subgraph.fetchTriples,
        },
        params,
        signal,
      });

      const dedupedColumns = columns.reduce((acc, column) => {
        if (acc.find(c => c.id === column.id)) return acc;
        return [...acc, column];
      }, [] as Column[]);

      return dedupedColumns;
    },
  });

  const { data: rows, isLoading: isLoadingRows } = useQuery({
    queryKey: ['table-block-rows', columns, selectedType.entityId, pageNumber, entityId, filterState],
    queryFn: async ({ signal }) => {
      if (!columns) return [];

      const filterString = TableBlockSdk.createGraphQLStringFromFiltersV2(filterState ?? [], selectedType.entityId);

      const params: FetchRowsOptions['params'] = {
        filter: filterString,
        first: PAGE_SIZE + 1,
        skip: pageNumber * PAGE_SIZE,
      };

      /**
       * Aggregate data for the rows from local and server entities.
       */
      const { rows } = await merged.rows(
        {
          signal,
          params,
          api: {
            fetchTableRowEntities: subgraph.fetchTableRowEntities,
          },
        },
        columns,
        selectedType.entityId
      );

      return rows;
    },
  });

  const { data: columnRelationTypes } = useQuery({
    queryKey: ['table-block-column-relation-types', columns, allActions],
    queryFn: async () => {
      if (!columns) return {};
      // 1. Fetch all attributes that are entity values
      // 2. Filter attributes that have the relation type attribute
      // 3. Return the type id and name of the relation type

      // Make sure we merge any unpublished entities
      const maybeRelationAttributeTypes = await Promise.all(
        columns.map(t => t.id).map(attributeId => merged.fetchEntity({ id: attributeId }))
      );

      const relationTypeEntities = maybeRelationAttributeTypes.flatMap(a => (a ? a.triples : []));

      // Merge all local and server triples
      const mergedTriples = Triple.fromActions(allActions, relationTypeEntities);

      const relationTypes = mergedTriples.filter(
        t => t.attributeId === SYSTEM_IDS.RELATION_VALUE_RELATIONSHIP_TYPE && t.value.type === 'entity'
      );

      return relationTypes.reduce<Record<string, { typeId: string; typeName: string | null; spaceId: string }[]>>(
        (acc, relationType) => {
          if (!acc[relationType.entityId]) acc[relationType.entityId] = [];

          acc[relationType.entityId].push({
            typeId: relationType.value.id,

            // We can safely cast here because we filter for entity type values above.
            typeName: (relationType.value as EntityValue).name,
            spaceId: relationType.space,
          });

          return acc;
        },
        {}
      );
    },
  });

  const setPage = React.useCallback(
    (page: number | 'next' | 'previous') => {
      switch (page) {
        case 'next':
          setPageNumber(prev => prev + 1);
          break;
        case 'previous': {
          setPageNumber(prev => {
            if (prev - 1 < 0) return 0;
            return prev - 1;
          });
          break;
        }
        default:
          setPageNumber(page);
      }
    },
    [setPageNumber]
  );

  const setFilterState = React.useCallback(
    (filters: TableBlockFilter[]) => {
      const newState = filters.length === 0 ? [] : filters;

      // We can just set the string as empty if the new state is empty. Alternatively we just delete the triple.
      const newFiltersString =
        newState.length === 0 ? '' : TableBlockSdk.createGraphQLStringFromFilters(newState, selectedType.entityId);

      const entityName = Entity.name(nameTriple ? [nameTriple] : []) ?? '';

      if (!filterTriple) {
        return create(
          Triple.withId({
            attributeId: SYSTEM_IDS.FILTER,
            attributeName: 'Filter',
            entityId,
            space: spaceId,
            entityName,
            value: {
              type: 'string',
              value: newFiltersString,
              id: ID.createValueId(),
            },
          })
        );
      }

      return update(
        Triple.ensureStableId({
          ...filterTriple,
          entityName,
          value: {
            ...filterTriple.value,
            type: 'string',
            value: newFiltersString,
          },
        }),
        filterTriple
      );
    },
    [create, update, entityId, filterTriple, nameTriple, selectedType.entityId, spaceId]
  );

  const setName = React.useCallback(
    (newName: string) => {
      TableBlockSdk.upsertName({
        newName: newName,
        nameTriple,
        spaceId,
        entityId,
        api: { update, create },
      });
    },
    [create, entityId, nameTriple, spaceId, update]
  );

  return {
    blockEntity,
    rows: rows?.slice(0, PAGE_SIZE) ?? [],
    columns: columns ?? [],

    columnRelationTypes: columnRelationTypes ?? {},

    filterState: filterState ?? [],
    setFilterState,

    pageNumber,
    hasNextPage: rows ? rows?.length > PAGE_SIZE : false,
    hasPreviousPage: pageNumber > 0,
    setPage,

    type: selectedType,
    entityId,
    spaceId,

    isLoading: isLoadingColumns || isLoadingRows || isLoadingFilterState || isLoading,

    nameTriple,
    name: Value.stringValue(nameTriple ?? undefined),
    setName,
  };
}

const TableBlockContext = React.createContext<{ entityId: string; selectedType: GeoType; spaceId: string } | undefined>(
  undefined
);

interface Props {
  spaceId: string;
  children: React.ReactNode;

  selectedType?: GeoType;
  entityId: string;
}

export function TableBlockProvider({ spaceId, children, selectedType, entityId }: Props) {
  if (!selectedType) {
    // A table block might reference a type that has been deleted which will not be found
    // in the types store.
    console.error(`Undefined type in blockId: ${entityId}`);
    throw new Error('Missing selectedType in TableBlockStoreProvider');
  }

  const store = React.useMemo(() => {
    return {
      spaceId,
      entityId,
      selectedType,
    };
  }, [spaceId, selectedType, entityId]);

  return <TableBlockContext.Provider value={store}>{children}</TableBlockContext.Provider>;
}

export function useTableBlockInstance() {
  const value = React.useContext(TableBlockContext);

  if (!value) {
    throw new Error(`Missing EntityPageTableBlockStoreProvider`);
  }

  return value;
}
