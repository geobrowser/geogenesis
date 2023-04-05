import { A, G, pipe } from '@mobily/ts-belt';
import { ActionsStore } from '~/modules/action';
import { Entity } from '~/modules/entity';
import { Triple } from '~/modules/triple';
import { OmitStrict, Version } from '~/modules/types';
import { INetwork } from '../network';

interface MergeDataSourceOptions {
  api: INetwork;
  store: ActionsStore;
}

interface IMergeDataSource extends OmitStrict<INetwork, 'publish' | 'uploadFile'> {}

export class MergeDataSource implements IMergeDataSource {
  private api: INetwork;
  private store: ActionsStore;

  constructor({ api, store }: MergeDataSourceOptions) {
    this.api = api;
    this.store = store;
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
    const maybeNetworkEntity = await this.api.fetchEntity(id);

    const globalActions = Triple.fromActions(
      Object.values(this.store.actions$.get()).flatMap(a => a),
      []
    );

    if (!globalActions.some(a => a.entityId === id)) return maybeNetworkEntity;

    // Need to find the local version of this entity if it exists and merge it with the network entity
    // if it exists.
    const entity = pipe(
      this.store.actions$.get(),
      actions => Entity.mergeActionsWithEntities(actions, maybeNetworkEntity ? [maybeNetworkEntity] : []),
      A.find(e => e.id === id)
    );

    if (!entity) {
      return null;
    }

    return entity;
  };

  columns = async (options: Parameters<INetwork['columns']>[0]) => this.api.columns(options);
  rows = async (options: Parameters<INetwork['rows']>[0]) => this.api.rows(options);

  // Right now we can't create local spaces, so we just return the network spaces.
  fetchSpaces = async () => this.api.fetchSpaces();

  fetchProfile = async () => null;

  fetchProposedVersions = async (
    entityId: string,
    spaceId: string,
    abortController?: AbortController | undefined
  ): Promise<Version[]> => {
    return this.api.fetchProposedVersions(entityId, spaceId, abortController);
  };
}
