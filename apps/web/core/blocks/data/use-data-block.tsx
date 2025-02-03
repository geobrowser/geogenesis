import { SYSTEM_IDS } from '@geogenesis/sdk';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Effect } from 'effect';

import * as React from 'react';

import { mergeEntityAsync, useEntity } from '../../database/entities';
import { upsert } from '../../database/write';
import { useProperties } from '../../hooks/use-properties';
import { Entity } from '../../io/dto/entities';
import { EntityId, SpaceId } from '../../io/schema';
import { Cell, PropertySchema } from '../../types';
import { mapSelectorLexiconToSourceEntity, parseSelectorIntoLexicon } from './data-selectors';
import { Filter } from './filters';
import { MergeTableEntitiesArgs, mergeEntitiesAsync, mergeTableEntities } from './queries';
import { Source } from './source';
import { useCollection } from './use-collection';
import { useFilters } from './use-filters';
import { Mapping, mappingToCell, mappingToRows } from './use-mapping';
import { usePagination } from './use-pagination';
import { useSource } from './use-source';
import { useView } from './use-view';

export const PAGE_SIZE = 9;

interface RenderablesQueryKey {
  pageNumber: number;
  entityId: string;
  filterState: Filter[];
  source: Source;
  collectionItems: Entity[];
  mapping: Mapping;
  spaceId: string;
}

const queryKeys = {
  renderables: (args: RenderablesQueryKey) => ['blocks', 'data', 'renderables', args],
  columnsSchema: (columns?: PropertySchema[]) => ['blocks', 'data', 'columns-schema', columns],
};

export function useDataBlock() {
  const { entityId, spaceId, pageNumber, setPage } = useDataBlockInstance();

  const blockEntity = useEntity({
    spaceId: SpaceId(spaceId),
    id: EntityId(entityId),
  });

  const { filterState, isLoading: isLoadingFilterState, isFetched: isFilterStateFetched } = useFilters();
  const { source } = useSource();
  const { collectionItems } = useCollection();
  const { shownColumnIds, mapping, isLoading: isViewLoading, isFetched: isViewFetched } = useView();

  const {
    data: rows,
    isLoading: isLoadingRenderables,
    isFetched: isRenderablesFetched,
  } = useQuery({
    enabled: filterState !== undefined,
    placeholderData: keepPreviousData,
    // @TODO: Should re-run when the relations for the entity source changes
    queryKey: queryKeys.renderables({
      pageNumber,
      collectionItems,
      entityId,
      source,
      filterState,
      mapping,
      spaceId,
    }),
    queryFn: async () => {
      const run = Effect.gen(function* () {
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
         * 2. Fetch Shown columns/properties and check for optional data selector
         * 2. Process which fields should exist on a {@link Row} based on the shown columns,
         *    view, the query mode, and selectors.
         * 3. Return the list of {@link Row} data structures.
         */

        if (source.type === 'SPACES' || source.type === 'GEO') {
          const data = yield* Effect.promise(() => mergeTableEntities({ options: params, filterState }));

          return mappingToRows(data, shownColumnIds, collectionItems, spaceId);
        }

        if (source.type === 'COLLECTION') {
          const data = yield* Effect.promise(() =>
            mergeEntitiesAsync({
              entityIds: collectionItems.map(c => c.id),
              filterState,
            })
          );

          return mappingToRows(data, shownColumnIds, collectionItems, spaceId);
        }

        if (source.type === 'RELATIONS') {
          const sourceEntity = yield* Effect.promise(() => mergeEntityAsync(EntityId(source.value)));
          const maybeFilter = filterState.find(f => f.columnId === SYSTEM_IDS.RELATION_TYPE_ATTRIBUTE);

          if (!maybeFilter) {
            return [];
          }

          const relations = sourceEntity?.relationsOut.filter(r => r.typeOf.id === maybeFilter.value);

          if (!relations) {
            return [];
          }

          const data = yield* Effect.forEach(
            relations,
            relation =>
              Effect.promise(async () => {
                const cells: Cell[] = [];

                for (const [propertyId, selector] of Object.entries(mapping)) {
                  const lexicon = parseSelectorIntoLexicon(selector);
                  const entities = await mapSelectorLexiconToSourceEntity(lexicon, relation.id);
                  cells.push(mappingToCell(entities, propertyId, lexicon, spaceId));
                }

                return {
                  entityId: relation.id,
                  columns: cells.reduce<Record<string, Cell>>((acc, cell) => {
                    acc[cell.slotId] = cell;
                    return acc;
                  }, {}),
                };
              }),
            {
              concurrency: 10,
            }
          );

          return data;
        }

        return [];
      });

      return await Effect.runPromise(run);
    },
  });

  // Use the mapping to get the potential renderable properties.
  const { properties: propertiesSchema } = useProperties(shownColumnIds);

  const setName = (newName: string) => {
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
  };

  // @TODO: Returned data type should be a FSM depending on the source.type
  return {
    entityId,
    spaceId,

    rows: rows?.slice(0, PAGE_SIZE) ?? [],
    properties: [...propertiesSchema.values()],
    propertiesSchema,

    pageNumber,
    hasNextPage: rows ? rows?.length > PAGE_SIZE : false,
    hasPreviousPage: pageNumber > 0,
    setPage,

    // We combine fetching state into loading state due to the transition from
    // the server representation of our editor to the client representation. We
    // don't want to transition from a loading state on the server to an empty
    // state then back into a loading state. By adding the isFetched state we
    // will stay in a placeholder state until we've fetched our queries at least
    // one time.
    isLoading:
      isLoadingRenderables ||
      isLoadingFilterState ||
      isViewLoading ||
      !isFilterStateFetched ||
      !isRenderablesFetched ||
      !isViewFetched,

    name: blockEntity.name,
    setName,
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

  const store = {
    spaceId,
    entityId,
    relationId,
    pageNumber,
    setPage,
  };

  return <DataBlockContext.Provider value={store}>{children}</DataBlockContext.Provider>;
}

export function useDataBlockInstance() {
  const context = React.useContext(DataBlockContext);

  if (context === null) {
    throw new Error(`Missing EntityPageTableBlockStoreProvider`);
  }

  return context;
}
