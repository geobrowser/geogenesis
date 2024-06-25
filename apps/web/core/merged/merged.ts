import { A, G, pipe } from '@mobily/ts-belt';
import { QueryClient } from '@tanstack/react-query';

import { Subgraph } from '~/core/io';
import { useLocalStore } from '~/core/state/local-store';
import { Column, Triple as ITriple, OmitStrict, Row, Value } from '~/core/types';
import { Entities } from '~/core/utils/entity';
import { EntityTable } from '~/core/utils/entity-table';
import { Triples } from '~/core/utils/triples';

import { TableBlockSdk } from '../blocks-sdk';
import { useActionsStore } from '../hooks/use-actions-store';
import { fetchColumns } from '../io/fetch-columns';
import { fetchRows } from '../io/fetch-rows';

interface MergedDataSourceOptions {
  store: ReturnType<typeof useActionsStore>;
  localStore: ReturnType<typeof useLocalStore>;
  subgraph: Subgraph.ISubgraph;
  cache: QueryClient;
}

interface IMergedDataSource
  extends OmitStrict<
    Subgraph.ISubgraph,
    // These data models don't have local equivalents, so we don't need merging logic for them.
    | 'fetchProposedVersion'
    | 'fetchProposal'
    | 'fetchProposals'
    | 'fetchTableRowEntities'
    | 'fetchProposedVersions'
    | 'fetchSpace'
    | 'fetchSpaces'
    | 'fetchProfile'
    | 'fetchOnchainProfile'
  > {
  // Rows and columns aren't part of the subgraph API and instead are higher-order functions that
  // call the subgraph APIs themselves. This is because rows and columns are not entities in the
  // subgraph. We include them here so have a unified API for merging data in the app.
  rows: (
    options: Parameters<typeof fetchRows>[0],
    columns: Column[],
    selectedTypeEntityId?: string
  ) => Promise<{ rows: Row[] }>;
  columns: (options: Parameters<typeof fetchColumns>[0]) => Promise<Column[]>;
}

/**
 * The Merged module attempts to merge local actions with network data. The API surface area for methods
 * on the Merged class should be the same as the Network class.
 */
export class Merged implements IMergedDataSource {
  private cache: QueryClient;
  private store: ReturnType<typeof useActionsStore>;
  private localStore: ReturnType<typeof useLocalStore>;
  private subgraph: Subgraph.ISubgraph;

  constructor({ store, localStore, subgraph, cache }: MergedDataSourceOptions) {
    this.store = store;
    this.localStore = localStore;
    this.subgraph = subgraph;
    this.cache = cache;
  }

  // Right now we don't filter locally created triples in fetchTriples. This means that we may return extra
  // triples that do not match the passed in query + filter.
  fetchTriples = async (options: Parameters<Subgraph.ISubgraph['fetchTriples']>[0]): Promise<ITriple[]> => {
    const networkTriples = await this.cache.fetchQuery({
      queryFn: () => this.subgraph.fetchTriples(options),
      queryKey: ['merged-fetch-triples', options],
    });

    const actions = options.space ? this.store.actions[options.space] : this.store.allActions;

    // Merge any local actions with the network triples
    const updatedTriples = Triples.merge(actions, networkTriples);
    const mergedTriplesWithName = Triples.withLocalNames(actions, updatedTriples);

    // Apply any server filters to locally created data.
    let locallyFilteredTriples = mergedTriplesWithName;

    for (const filter of options.filter ?? []) {
      locallyFilteredTriples = locallyFilteredTriples.filter(t => {
        if (filter.field === 'attribute-id') {
          return t.attributeId === filter.value;
        }

        if (filter.field === 'entity-id') {
          return t.entityId === filter.value;
        }

        if (filter.field === 'attribute-name') {
          return t.attributeName === filter.value;
        }

        if (filter.field === 'entity-name') {
          return t.entityName === filter.value;
        }

        if (filter.field === 'linked-to') {
          return t.value.type === 'ENTITY' && t.value.value === filter.value;
        }

        if (filter.field === 'value') {
          return t.value.type === 'ENTITY' && t.value.name === filter.value;
        }
      });
    }

    return locallyFilteredTriples;
  };

  fetchEntities = async (options: Parameters<Subgraph.ISubgraph['fetchEntities']>[0]) => {
    const networkEntities = await this.subgraph.fetchEntities(options);

    // @TODO: Do local actions need to have filters applied to them? Right now we aren't doing
    // this in our app code for local entities. This might mean that we render local entities that
    // don't map to the selected filter.
    const localEntities = pipe(
      this.store.actions,
      actions => Entities.mergeActionsWithEntities(actions, networkEntities),
      A.filter(e => {
        if (!G.isString(e.name)) {
          return false;
        }

        // If the entity does not have the selected types don't return it.
        if (options.typeIds && options.typeIds.length > 0) {
          if (!e.types.some(t => options.typeIds?.includes(t.id))) return false;
        }

        const lowerName = e.name.toLowerCase();
        const lowerQuery = options.query ? options.query.toLowerCase() : '';
        return lowerName.startsWith(lowerQuery) || lowerName.includes(lowerQuery);
      })
    );

    // We want to favor the local version of an entity if it exists on the network already.
    const localEntityIds = new Set(localEntities.map(e => e.id));

    // This will put the local entities first, and then the network entities that don't exist locally.
    // This might not be the ideal UX.
    return [...localEntities, ...networkEntities.filter(e => !localEntityIds.has(e.id))];
  };

  /**
   * Merge the local version of an entity with the network version of an entity if they exist.
   * This is necessary because the local version of an entity might have actions that haven't been
   * published yet.
   *
   * States:
   * * Local entity exists, network entity exists: Merge the local entity with the network entity
   * * Local entity exists, network entity doesn't exist: Return the local entity
   * * Local entity doesn't exist, network entity exists: Return the network entity
   * * Local entity doesn't exist, network entity doesn't exist: Return null
   *
   */
  fetchEntity = async (options: Parameters<Subgraph.ISubgraph['fetchEntity']>[0]) => {
    try {
      const maybeNetworkEntity = await this.cache.fetchQuery({
        queryFn: () => this.subgraph.fetchEntity({ id: options.id }),
        queryKey: ['merged-fetch-entity', options.id],
      });

      const localTriplesForEntityId = this.store.allActions.filter(a => a.entityId === options.id);

      if (localTriplesForEntityId.length === 0) return maybeNetworkEntity;

      // If not networkEntity we need to just return the local entity
      if (!maybeNetworkEntity) {
        return Entities.fromTriples(this.store.allActions, options.id);
      }

      // If the network entity exists, we need to merge the local actions with the network entity.
      const entity = Entities.mergeActionsWithEntity(this.store.allActions, maybeNetworkEntity);

      if (!entity) {
        return null;
      }

      return entity;
    } catch (e) {
      console.error('Could not merge local entity with network entity', e);
      return null;
    }
  };

  columns = async (options: Parameters<typeof fetchColumns>[0]) => {
    const serverColumns = await fetchColumns(options);

    return EntityTable.columnsFromLocalChanges(this.localStore.triples, serverColumns, options.params.typeIds?.[0]);
  };

  rows = async (options: Parameters<typeof fetchRows>[0], columns: Column[], selectedTypeEntityId?: string) => {
    const serverRows = await fetchRows(options);

    const filterState = await TableBlockSdk.createFiltersFromGraphQLString(
      options.params.filter ?? '',
      async id => await this.fetchEntity({ id })
    );

    /**
     * Aggregate data for the rows from local and server entities.
     *
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
      this.localStore.entities,
      A.filter(e => e.types.some(t => t.id === selectedTypeEntityId)),
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
      changedEntitiesIdsFromAnotherType.map(id => this.subgraph.fetchEntity({ id }))
    );

    const serverEntitiesChangedLocally = maybeServerEntitiesChangedLocally
      .flatMap(e => (e ? [e] : []))
      // Uhhh this is O(n * m * o) where n is the number of entities, m is the number of triples
      // in an entity, and o is the number of filters. This is not great.
      .filter(entity => {
        for (const filter of filterState) {
          return entity.triples.some(triple => {
            // @HACK: We special-case `space` since it's not an attribute:value in an entity but is a property
            // attached to a triple in the data model. Once we represents entities across multiple spaces
            // this filter likely won't make sense anymore.
            if (filter.columnId === 'space') {
              return entity.nameTripleSpaces?.includes(filter.value);
            }

            return triple.attributeId === filter.columnId && filterValue(triple.value, filter.value);
          });
        }

        return true;
      });

    const serverEntityTriples = serverRows.flatMap(t => t.triples);

    // Merge the triples from the server with the triples from the local store and apply any filters
    // to them.
    const entitiesCreatedOrChangedLocally = pipe(
      this.store.actions,
      actions => Entities.mergeActionsWithEntities(actions, Entities.entitiesFromTriples(serverEntityTriples)),
      A.filter(e => e.types.some(t => t.id === selectedTypeEntityId)),
      A.filter(entity => {
        for (const filter of filterState) {
          return entity.triples.some(triple => {
            // @HACK: We special-case `space` since it's not an attribute:value in an entity but is a property
            // attached to a triple in the data model. Once we represents entities across multiple spaces
            // this filter likely won't make sense anymore.
            if (filter.columnId === 'space') {
              return entity.nameTripleSpaces?.includes(filter.value);
            }

            return triple.attributeId === filter.columnId && filterValue(triple.value, filter.value);
          });
        }

        return true;
      })
    );

    const localEntitiesIds = new Set(entitiesCreatedOrChangedLocally.map(e => e.id));
    const serverEntitiesChangedLocallyIds = new Set(serverEntitiesChangedLocally.map(e => e.id));

    // Filter out any server row triples that have been changed locally
    const filteredServerRows = serverEntityTriples.filter(
      sr => !localEntitiesIds.has(sr.entityId) && !serverEntitiesChangedLocallyIds.has(sr.entityId)
    );

    const entities = Entities.entitiesFromTriples([
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

    return EntityTable.fromColumnsAndRows(entities, columns);
  };
}

function filterValue(value: Value, valueToFilter: string) {
  switch (value.type) {
    case 'TEXT':
      return value.value === valueToFilter;
    case 'ENTITY':
      return value.value === valueToFilter;
    default:
      return false;
  }
}
