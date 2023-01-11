import { computed, observable, ObservableComputed } from '@legendapp/state';
import { useSelector } from '@legendapp/state/react';
import { A, G, pipe } from '@mobily/ts-belt';
import { useEffect, useMemo } from 'react';
import { Services } from '~/modules/services';
import { INetwork } from '~/modules/services/network';
import { makeOptionalComputed } from '~/modules/utils';
import { Entity } from '.';
import { ActionsStore, useActionsStoreContext } from '../action';
import { Entity as EntityType } from '../types';

interface EntityAutocompleteOptions {
  api: INetwork;
  spaceId: string;
  ActionsStore: ActionsStore;
}

class EntityAutocomplete {
  query$ = observable('');
  results$: ObservableComputed<EntityType[]>;
  abortController: AbortController = new AbortController();

  constructor({ api, spaceId, ActionsStore }: EntityAutocompleteOptions) {
    this.results$ = makeOptionalComputed(
      [],
      computed(async () => {
        this.abortController.abort();
        this.abortController = new AbortController();

        try {
          const query = this.query$.get();

          const networkEntities = await api.fetchEntities(query, spaceId, this.abortController);
          const localEntities = Entity.mergeActionsWithNetworkEntities(ActionsStore.actions$.get(), networkEntities);

          // We want to favor the local version of an entity if it exists on the network already.
          const localEntityIds = new Set(localEntities.map(e => e.id));
          const mergedEntities = [...localEntities, ...networkEntities.filter(e => !localEntityIds.has(e.id))];

          return pipe(
            mergedEntities,
            A.filter(e => G.isString(e.name) && e.name.toLowerCase().startsWith(query.toLowerCase()))
          );
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
    return new EntityAutocomplete({ api: network, spaceId, ActionsStore });
  }, [network, spaceId, ActionsStore]);

  useEffect(() => {
    return () => {
      autocomplete.query$.set('');
    };
  }, [autocomplete]);

  const results = useSelector(autocomplete.results$);
  const query = useSelector(autocomplete.query$);

  return {
    results,
    query,
    onQueryChange: autocomplete.onQueryChange,
  };
}
