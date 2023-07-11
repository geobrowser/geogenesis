import { A, G, pipe } from '@mobily/ts-belt';
import { ActionsStore } from '~/modules/action';
import { Entity, EntityTable } from '~/modules/entity';
import { Triple } from '~/modules/triple';
import { Column, OmitStrict, Row, Version } from '~/modules/types';
import { INetwork } from './network';
import { LocalData } from '.';

interface MergeDataSourceOptions {
  api: INetwork;
  store: ActionsStore;
  localStore: LocalData.LocalStore;
}

interface IMergeDataSource
  extends OmitStrict<INetwork, 'publish' | 'uploadFile' | 'rows' | 'fetchProposedVersion' | 'fetchProposal'> {
  rows: (
    options: Parameters<INetwork['rows']>[0],
    columns: Column[],
    selectedTypeEntityId?: string
  ) => Promise<{ rows: Row[] }>;
}

export class Merged implements IMergeDataSource {
  private api: INetwork;
  private store: ActionsStore;
  private localStore: LocalData.LocalStore;

  constructor({ api, store, localStore }: MergeDataSourceOptions) {
    this.api = api;
    this.store = store;
    this.localStore = localStore;
  }

  // Right now we don't filter locally created triples in fetchTriples. This means that we may return extra
  // triples that do not match the passed in query + filter.
  fetchTriples = async (options: Parameters<INetwork['fetchTriples']>[0]) => {
    const networkTriples = await this.api.fetchTriples(options);

    if (!options.space) return networkTriples;

    const actions = this.store.actions$.get()[options.space] ?? [];

    // We want to merge any local actions with the network triples
    // @TODO: Do local actions need to have filters applied to them? Right now we aren't doing
    // this in our app code for local triples. This might mean that we render local triples that
    // don't map to the selected filter.
    const updatedTriples = Triple.fromActions(actions, networkTriples.triples);
    const mergedTriplesWithName = Triple.withLocalNames(actions, updatedTriples);

    return {
      triples: mergedTriplesWithName,
    };
  };

  fetchEntities = async (options: Parameters<INetwork['fetchEntities']>[0]) => {
    const networkEntities = await this.api.fetchEntities(options);

    // @TODO: Do local actions need to have filters applied to them? Right now we aren't doing
    // this in our app code for local entities. This might mean that we render local entities that
    // don't map to the selected filter.
    const localEntities = pipe(
      this.store.actions$.get(),
      actions => Entity.mergeActionsWithEntities(actions, networkEntities),
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
  fetchEntity = async (id: Parameters<INetwork['fetchEntity']>[0]) => {
    try {
      const maybeNetworkEntity = await this.api.fetchEntity(id);

      const globalActions = Triple.fromActions(this.store.allActions$.get(), []);

      if (!globalActions.some(a => a.entityId === id)) return maybeNetworkEntity;

      // Need to find the local version of this entity if it exists and merge it with the network entity
      // if it exists. If the network entity doesn't exist, we search the local store for the entity.
      const entity = pipe(
        this.localStore.entities$.get(),
        A.find(e => e.id === id)
      );

      if (!entity) {
        return null;
      }

      return entity;
    } catch (e) {
      console.error('Could not merge local entity with network entity', e);
      return null;
    }
  };

  columns = async (options: Parameters<INetwork['columns']>[0]) => {
    const { columns: serverColumns } = await this.api.columns(options);

    const columns = EntityTable.columnsFromLocalChanges(
      this.localStore.triples$.get(),
      serverColumns,
      options.params.typeIds?.[0]
    );

    return { columns };
  };

  rows = async (options: Parameters<INetwork['rows']>[0], columns: Column[], selectedTypeEntityId?: string) => {
    const { rows: serverRows } = await this.api.rows(options);

    console.log('rerunning merged data rows');

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

    // @TODO: We can probably just check the action store for any entity that has the selected type.
    // if it does, we can do `this.fetchEntity` to get the entire entity, regardless of whether it
    // is local-only or not.
    const changedEntitiesIdsFromAnotherType = pipe(
      this.localStore.entities$.get(),
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
      changedEntitiesIdsFromAnotherType.map(id => this.api.fetchEntity(id))
    );

    const serverEntitiesChangedLocally = maybeServerEntitiesChangedLocally.flatMap(e => (e ? [e] : []));

    const serverEntityTriples = serverRows.flatMap(t => t.triples);

    const entitiesCreatedOrChangedLocally = pipe(
      this.localStore.entities$.get(),
      A.filter(e => e.types.some(t => t.id === selectedTypeEntityId))
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
    const entitiesWithSelectedType = entities.filter(e => e.types.some(t => t.id === selectedTypeEntityId));

    return EntityTable.fromColumnsAndRows(entitiesWithSelectedType, columns);
  };

  // Right now we can't create local spaces, so we just return the network spaces.
  fetchSpaces = async () => this.api.fetchSpaces();

  fetchProfile = async () => null;

  // Proposed versions are server only
  fetchProposedVersions = async (
    entityId: string,
    spaceId: string,
    abortController?: AbortController
  ): Promise<Version[]> => {
    return this.api.fetchProposedVersions(entityId, spaceId, abortController);
  };

  // Proposals are server only
  fetchProposals = async (spaceId: string, abortController?: AbortController) =>
    this.api.fetchProposals(spaceId, abortController);
}
