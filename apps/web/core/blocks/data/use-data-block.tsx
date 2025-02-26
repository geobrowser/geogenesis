import { SYSTEM_IDS } from '@graphprotocol/grc-20';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Effect } from 'effect';

import * as React from 'react';

import { useEntity } from '../../database/entities';
import { upsert } from '../../database/write';
import { PropertyId, useProperties } from '../../hooks/use-properties';
import { Entity } from '../../io/dto/entities';
import { EntityId, SpaceId } from '../../io/schema';
import { Cell, PropertySchema, Relation } from '../../types';
import { mapSelectorLexiconToSourceEntity, parseSelectorIntoLexicon } from './data-selectors';
import { Filter } from './filters';
import { MergeTableEntitiesArgs, mergeEntitiesAsync, mergeTableEntities } from './queries';
import { Source } from './source';
import { useCollection } from './use-collection';
import { useFilters } from './use-filters';
import { Mapping, mappingToCell, mappingToRows } from './use-mapping';
import { usePagination } from './use-pagination';
import { useRelationsBlock } from './use-relations-block';
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
  sourceEntityRelations: Relation[];
  properties?: Record<PropertyId, PropertySchema>;
}

const queryKeys = {
  renderables: (args: RenderablesQueryKey) => ['blocks', 'data', 'renderables', args],
  columnsSchema: (columns?: PropertySchema[]) => ['blocks', 'data', 'columns-schema', columns],
};

export function useDataBlock() {
  const { entityId, spaceId, pageNumber, relationId, setPage } = useDataBlockInstance();

  const blockEntity = useEntity({
    spaceId: SpaceId(spaceId),
    id: EntityId(entityId),
  });

  const { relationBlockSourceRelations } = useRelationsBlock();
  const { filterState, isLoading: isLoadingFilterState, isFetched: isFilterStateFetched } = useFilters();
  const { shownColumnIds, mapping, isLoading: isViewLoading, isFetched: isViewFetched } = useView();
  const { source } = useSource();
  const { collectionItems } = useCollection();
  // Use the mapping to get the potential renderable properties.
  const propertiesSchema = useProperties(shownColumnIds);

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
      entityId,
      source,
      filterState,
      mapping,
      spaceId,
      collectionItems,
      sourceEntityRelations: relationBlockSourceRelations,
      properties: propertiesSchema,
    }),
    queryFn: async () => {
      const run = Effect.gen(function* () {
        const params: MergeTableEntitiesArgs['options'] = {
          first: PAGE_SIZE + 1,
          skip: pageNumber * PAGE_SIZE,
        };

        /**
         * Data blocks support several "query" modes which require fetching and aggregating
         * different data in different ways. In order to simplify rendering we want to map
         * the data from each of these modes into a unified format. This keeps the complexities
         * of the query modes out of the UI/rendering code.
         *
         * For COLLECTION data blocks we read collection item relations directly from the data
         * block itself.
         *
         * For ENTITIES data blocks, we read from a filter stored on the data block and make a
         * dynamic query for any entities that match the filter.
         *
         * For RELATIONS data blocks, we start from a _specific_ entity and dynamically fetch
         * specific data from that entity to render in the data block. e.g., I might want to
         * render the name of the entity, the Spouse relation's to entity avatar, and the
         * Spouse relation's description. This requires reading data from three different
         * entities. In order to specify the specific data set, we use a mechanism called
         * "Selectors." Selectors are a custom DSL for specifying which data to fetch from
         * an entity. Selectors live on the "Properties" relation pointing from the Blocks
         * relation pointing to the data block.
         */
        if (source.type === 'SPACES' || source.type === 'GEO') {
          const data = yield* Effect.promise(() => mergeTableEntities({ options: params, filterState }));

          return mappingToRows(data, shownColumnIds, collectionItems, spaceId, propertiesSchema);
        }

        if (source.type === 'COLLECTION') {
          const data = yield* Effect.promise(() =>
            mergeEntitiesAsync({
              entityIds: collectionItems.map(c => c.id),
              filterState,
            })
          );

          return mappingToRows(data, shownColumnIds, collectionItems, spaceId, propertiesSchema);
        }

        if (source.type === 'RELATIONS') {
          const data = yield* Effect.forEach(
            relationBlockSourceRelations,
            relation =>
              Effect.promise(async () => {
                const cells: Cell[] = [];

                for (const [propertyId, selector] of Object.entries(mapping)) {
                  const lexicon = parseSelectorIntoLexicon(selector);
                  const entities = await mapSelectorLexiconToSourceEntity(lexicon, relation.id);
                  cells.push(mappingToCell(entities, propertyId, lexicon, spaceId, relation.id));
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
    relationId,

    rows: rows?.slice(0, PAGE_SIZE) ?? [],
    properties: propertiesSchema ? Object.values(propertiesSchema) : [],
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
    //
    // @NOTE there's an edge-case issue where collection queries respond to the
    // loading states differently than the other types of queries. If we include
    // the renderable fetched state collection blocks will jitter between loading
    // and fetched states. Will fix this in the future, for now just discard the
    // renderable fetched state for collection blocks.
    isLoading:
      source.type === 'COLLECTION'
        ? isLoadingRenderables || isLoadingFilterState || isViewLoading || !isFilterStateFetched || !isViewFetched
        : isLoadingRenderables ||
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
    throw new Error(`Missing DataBlockProvider`);
  }

  return context;
}
