import { SYSTEM_IDS } from '@geogenesis/ids';
import { Observable, ObservableComputed, computed, observable } from '@legendapp/state';
import { A, pipe } from '@mobily/ts-belt';

import { TableBlockSdk } from '~/core/blocks-sdk';
import { Network } from '~/core/io';
import { Merged } from '~/core/merged';
import { ActionsStore } from '~/core/state/actions-store';
import { SpaceStore } from '~/core/state/spaces-store/space-store';
import { CreateType } from '~/core/type';
import { Column, EntityValue, Row, Space, Triple as TripleType } from '~/core/types';
import { Entity } from '~/core/utils/entity';
import { EntityTable } from '~/core/utils/entity-table';
import { Triple } from '~/core/utils/triple';
import { makeOptionalComputed } from '~/core/utils/utils';

import { LocalStore } from '../local-store';
import { InitialEntityTableStoreParams } from './entity-table-store-params';

export type SelectedType = { id: string; entityId: string; entityName: string | null };

interface IEntityTableStore {
  rows$: ObservableComputed<Row[]>;
  columns$: ObservableComputed<Column[]>;
  selectedType$: Observable<SelectedType | null>;
  pageNumber$: Observable<number>;
  query$: Observable<string>;
  hasPreviousPage$: ObservableComputed<boolean>;
  hydrated$: Observable<boolean>;
  hasNextPage$: ObservableComputed<boolean>;
  ActionsStore: ActionsStore;
  SpaceStore: SpaceStore;
  setQuery(query: string): void;
  setPageNumber(page: number): void;
}

interface IEntityTableStoreConfig {
  api: Network.INetwork;
  spaceId: string;
  initialParams?: InitialEntityTableStoreParams;
  pageSize?: number;
  initialSelectedType: TripleType | null;
  ActionsStore: ActionsStore;
  SpaceStore: SpaceStore;
  LocalStore: LocalStore;
  initialColumns: Column[];
  initialRows: Row[];
}

export const DEFAULT_PAGE_SIZE = 50;
export const DEFAULT_INITIAL_PARAMS = {
  query: '',
  pageNumber: 0,
  filterState: [],
  typeId: '',
};

/**
 * The EntityTableStore handles state and logic for the EntityTable component that
 * gets rendered on the /spaces/[id] route. For now it duplicated a lot of functionality
 * that we have in the TableBlockStore as well. Eventually the EntityTable will be
 * de-emphasized in the product and we will be able to migrate a lot of the implementation
 * from the TableBlockStore to here.
 *
 * For now we are fine with the duplication.
 */
export class EntityTableStore implements IEntityTableStore {
  private api: Network.INetwork;
  rows$: ObservableComputed<Row[]>;
  columns$: ObservableComputed<Column[]>;
  unpublishedColumns$: ObservableComputed<Column[]>;
  hydrated$: Observable<boolean> = observable(false);
  pageNumber$: Observable<number>;
  selectedType$: Observable<SelectedType | null>;
  columnRelationTypes$: ObservableComputed<
    Record<string, { typeId: string; typeName: string | null; spaceId: string }[]>
  >;

  query$: Observable<string>;
  space$: ObservableComputed<Space | undefined>;
  hasPreviousPage$: ObservableComputed<boolean>;
  hasNextPage$: ObservableComputed<boolean>;
  spaceId: string;
  ActionsStore: ActionsStore;
  SpaceStore: SpaceStore;
  LocalStore: LocalStore;
  abortController: AbortController = new AbortController();

  constructor({
    api,
    spaceId,
    initialSelectedType,
    ActionsStore,
    initialRows,
    initialColumns,
    LocalStore,
    SpaceStore,
    initialParams = DEFAULT_INITIAL_PARAMS,
    pageSize = DEFAULT_PAGE_SIZE,
  }: IEntityTableStoreConfig) {
    this.api = api;
    this.ActionsStore = ActionsStore;
    this.SpaceStore = SpaceStore;
    this.LocalStore = LocalStore;
    this.hydrated$ = observable(false);
    this.selectedType$ = observable<SelectedType | null>(initialSelectedType);
    this.pageNumber$ = observable(initialParams.pageNumber);

    this.spaceId = spaceId;
    this.query$ = observable(initialParams.query);

    this.rows$ = computed(() => initialRows);
    this.columns$ = computed(() => initialColumns);

    const networkData$ = makeOptionalComputed(
      { columns: [], rows: [], hasNextPage: false },
      computed(async () => {
        try {
          this.abortController.abort();
          this.abortController = new AbortController();

          const selectedType = this.selectedType$.get();
          const pageNumber = this.pageNumber$.get();

          const filterString = TableBlockSdk.createGraphQLStringFromFilters(
            [
              {
                columnId: SYSTEM_IDS.NAME,
                value: this.query$.get(),
                valueType: 'string',
              },
              // Only return rows that are in the current space
              {
                columnId: SYSTEM_IDS.SPACE,
                value: this.spaceId,
                valueType: 'string',
              },
            ],
            selectedType?.entityId ?? null
          );

          const params: Network.FetchRowsOptions['params'] = {
            filter: filterString,
            typeIds: selectedType?.entityId ? [selectedType.entityId] : [],
            first: pageSize + 1,
            skip: pageNumber * pageSize,
          };

          const { columns: serverColumns } = await this.api.columns({
            params,
            abortController: this.abortController,
          });

          const { rows: serverRows } = await this.api.rows({
            params,
            abortController: this.abortController,
          });

          this.hydrated$.set(true);

          return {
            columns: serverColumns,
            rows: serverRows.slice(0, pageSize),
            hasNextPage: serverRows.length > pageSize,
          };
        } catch (e) {
          if (e instanceof Error && e.name === 'AbortError') {
            // eslint-disable-next-line @typescript-eslint/no-empty-function
            return new Promise(() => {});
          }

          // TODO: Real error handling
          return { columns: [], rows: [], hasNextPage: false };
        }
      })
    );

    this.hasPreviousPage$ = computed(() => this.pageNumber$.get() > 0);
    this.hasNextPage$ = computed(() => networkData$.get().hasNextPage);

    this.unpublishedColumns$ = computed(() => {
      return EntityTable.columnsFromLocalChanges(
        this.LocalStore.triples$.get(),
        [],
        this.selectedType$.get()?.entityId
      );
    });

    this.columns$ = computed(() => {
      const { columns } = networkData$.get();
      return EntityTable.columnsFromLocalChanges(
        this.LocalStore.triples$.get(),
        columns,
        this.selectedType$.get()?.entityId
      );
    });

    this.space$ = computed(() => {
      const spaces = this.SpaceStore.spaces$.get();
      return spaces.find(s => s.id === spaceId);
    });

    this.rows$ = makeOptionalComputed(
      [],
      computed(async () => {
        const columns = this.columns$.get();
        const { rows: serverRows } = networkData$.get();

        /**
         * There are several edge-cases we need to handle in order to correctly merge local changes
         * with server data in the entity table:
         * 1. An entity is created locally and is given the selected type
         * 2. An entity is edited locally and is given the selected type
         * 3. A type is created locally and an entity is given the new type
         *
         * Since the table aggregation code expects triples, we may end up in a situation where
         * the type for an entity has changed, but the name hasn't. In this case there is no local
         * version of the name triple, so we need to fetch it along with any other triples the table
         * needs to render the columnSchema.
         */
        const changedEntitiesIdsFromAnotherType = pipe(
          this.LocalStore.entities$.get(),
          A.filter(e => e.types.some(t => t.id === this.selectedType$.get()?.entityId)),
          A.map(t => t.id)
        );

        // Fetch any entities that exist already remotely that have been changed locally
        // and have the selected type to make sure we have all of the triples necessary
        // to represent the entity in the table.
        //
        // e.g., We add Type A to Entity A. When we render the Type A table, we need
        // _all_ of the triples for Entity A, not just the ones that have changed locally.
        //
        // This will return null if the entity we're fetching does not exist remotely.
        // i.e., the entity was created locally and has not been published to the server.
        const maybeServerEntitiesChangedLocally = await Promise.all(
          changedEntitiesIdsFromAnotherType.map(id => this.api.fetchEntity(id))
        );

        const serverEntitiesChangedLocally = maybeServerEntitiesChangedLocally.flatMap(e => (e ? [e] : []));

        const serverEntityTriples = serverRows.flatMap(t => t.triples);

        const entitiesCreatedOrChangedLocally = pipe(
          this.ActionsStore.actions$.get(),
          actions => Entity.mergeActionsWithEntities(actions, Entity.entitiesFromTriples(serverEntityTriples)),
          A.filter(e => e.types.some(t => t.id === this.selectedType$.get()?.entityId))
        );

        const localEntitiesIds = new Set(entitiesCreatedOrChangedLocally.map(e => e.id));
        const serverEntitiesChangedLocallyIds = new Set(serverEntitiesChangedLocally.map(e => e.id));

        // Filter out any server rows that have been changed locally
        const filteredServerRows = serverEntityTriples.filter(
          sr => !localEntitiesIds.has(sr.entityId) && !serverEntitiesChangedLocallyIds.has(sr.entityId)
        );

        const entities = Entity.entitiesFromTriples([
          // These are entities that were created locally and have the selected type
          ...entitiesCreatedOrChangedLocally.flatMap(e => e.triples),

          // These are entities that have a new type locally and may exist on the server.
          // We need to fetch all triples associated with this entity in order to correctly
          // populate the table.
          ...serverEntitiesChangedLocally.flatMap(e => e.triples),

          // These are entities that have been fetched from the server and have the selected type.
          // They are deduped from the local changes above.
          ...filteredServerRows,
        ]);

        // Make sure we only generate rows for entities that have the selected type
        const entitiesWithSelectedType = entities.filter(e =>
          e.types.some(t => t.id === this.selectedType$.get()?.entityId)
        );

        const { rows } = EntityTable.fromColumnsAndRows(entitiesWithSelectedType, columns);

        return rows;
      })
    );

    this.columnRelationTypes$ = makeOptionalComputed(
      {},
      computed(async () => {
        const columns = this.columns$.get();

        // 1. Fetch all attributes that are entity values
        // 2. Filter attributes that have the relation type attribute
        // 3. Return the type id and name of the relation type

        // Make sure we merge any unpublished entities
        const mergedStore = new Merged({ api: this.api, store: this.ActionsStore, localStore: this.LocalStore });
        const maybeRelationAttributeTypes = await Promise.all(
          columns.map(column => mergedStore.fetchEntity(column.id))
        );

        const relationTypeEntities = maybeRelationAttributeTypes.flatMap(a => (a ? a.triples : []));

        // Merge all local and server triples
        const mergedTriples = A.uniqBy(
          Triple.fromActions(this.ActionsStore.allActions$.get(), relationTypeEntities),
          t => t.id
        );

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
      })
    );
  }

  setQuery = (query: string) => {
    this.query$.set(query);
  };

  setPageNumber = (pageNumber: number) => {
    this.pageNumber$.set(pageNumber);
  };

  setSelectedType = (type: SelectedType) => {
    this.selectedType$.set(type);
  };

  setNextPage = () => {
    // TODO: Bounds to the last page number
    this.pageNumber$.set(this.pageNumber$.get() + 1);
  };

  setPreviousPage = () => {
    const previousPageNumber = this.pageNumber$.get() - 1;
    if (previousPageNumber < 0) return;
    this.pageNumber$.set(previousPageNumber);
  };

  createForeignType = (foreignType: TripleType) => {
    CreateType.createForeignType(
      foreignType,
      this.spaceId,
      this.space$.spaceConfigEntityId.get(),
      this.ActionsStore.create
    );
  };

  createType = (entityName: string) => {
    return CreateType.createType(entityName, this.spaceId, this.ActionsStore.create);
  };
}
