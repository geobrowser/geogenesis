import { computed, Observable, observable, ObservableComputed } from '@legendapp/state';
import { useSelector } from '@legendapp/state/react';
import { A, G, pipe, S } from '@mobily/ts-belt';
import { useMemo } from 'react';
import { Services } from '~/modules/services';
import { INetwork } from '~/modules/services/network';
import { makeOptionalComputed } from '~/modules/utils';
import { Entity } from '../entity';
import { ActionsStore, useActionsStoreContext } from '../action';
import { Entity as EntityType } from '../types';

interface EntityAutocompleteOptions {
  api: INetwork;
  entityFetcher?: (name: string, space: string, abortController?: AbortController) => Promise<EntityType[]>;
  spaceId: string;
  ActionsStore: ActionsStore;
}

class EntityAutocomplete {
  loading$: Observable<boolean> = observable(false);
  query$ = observable('');
  results$: ObservableComputed<EntityType[]>;
  abortController: AbortController = new AbortController();

  constructor({ api, spaceId, ActionsStore, entityFetcher = api.fetchEntities }: EntityAutocompleteOptions) {
    this.results$ = makeOptionalComputed(
      [],
      computed(async () => {
        this.abortController.abort();
        this.abortController = new AbortController();

        try {
          const query = this.query$.get();

          if (query.length === 0) return [];

          this.loading$.set(true);

          const networkEntities = await entityFetcher(query, spaceId, this.abortController);

          const localEntities = pipe(
            ActionsStore.actions$.get(),
            actions => Entity.mergeActionsWithEntities(actions, networkEntities),
            A.filter(e => {
              if (!G.isString(e.name)) {
                return false;
              }

              const lowerName = e.name.toLowerCase();
              return lowerName.startsWith(query.toLowerCase()) || lowerName.includes(query.toLowerCase());
            })
          );

          // We want to favor the local version of an entity if it exists on the network already.
          const localEntityIds = new Set(localEntities.map(e => e.id));
          this.loading$.set(true);

          // This will put the local entities first, and then the network entities that don't exist locally.
          // This might not be the ideal UX.
          return [...localEntities, ...networkEntities.filter(e => !localEntityIds.has(e.id))];
        } catch (e) {
          return [];
        }
      })
    );
  }

  onQueryChange = (query: string) => {
    this.query$.set(query);
  };
}

export function useAutocomplete(spaceId: string) {
  const { network } = Services.useServices();
  const ActionsStore = useActionsStoreContext();

  const autocomplete = useMemo(() => {
    return new EntityAutocomplete({ api: network, spaceId, ActionsStore});
  }, [network, spaceId, ActionsStore]);

  const results = useSelector(autocomplete.results$);
  const query = useSelector(autocomplete.query$);
  const loading = useSelector(autocomplete.loading$);

  return {
    isEmpty: A.isEmpty(results) && S.isNotEmpty(query) && !loading,
    isLoading: loading,
    results: query ? results : [],
    query,
    onQueryChange: autocomplete.onQueryChange,
  };
}

export function useTypeAutocomplete(spaceId: string) {
  const { network } = Services.useServices();
  const ActionsStore = useActionsStoreContext();
  const entityFetcher = network.fetchAllEntities

  const autocomplete = useMemo(() => {
    return new EntityAutocomplete({ api: network, spaceId, ActionsStore, entityFetcher});
  }, [network, spaceId, ActionsStore]);

  const results = useSelector(autocomplete.results$);
  console.log('results', results)
  const query = useSelector(autocomplete.query$);
  const loading = useSelector(autocomplete.loading$);

  return {
    isEmpty: A.isEmpty(results) && S.isNotEmpty(query) && !loading,
    isLoading: loading,
    results: query ? results : [],
    query,
    onQueryChange: autocomplete.onQueryChange,
  };
}
