import { computed, observable, ObservableComputed } from '@legendapp/state';
import { useSelector } from '@legendapp/state/react';
import { A, D, G, pipe, S } from '@mobily/ts-belt';
import { useEffect, useMemo } from 'react';
import { Services } from '~/modules/services';
import { INetwork } from '~/modules/services/network';
import { makeOptionalComputed } from '~/modules/utils';
import { Entity } from '.';
import { Action, ActionsStore, useActionsStoreContext } from '../action';
import { Triple } from '../triple';
import { Action as ActionType, Entity as EntityType } from '../types';

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
          const networkEntities = await api.fetchEntities(this.query$.get(), spaceId, this.abortController);

          // const allActions = pipe();
          const localEntities = pipe(
            ActionsStore.actions$.get(),
            D.values,
            A.flat,
            // We need to merge the local actions with the network triple in order to correctly
            // display any description or type metadata in the search results list.
            actions => {
              const entityIds = actions.map(a => {
                switch (a.type) {
                  case 'createTriple':
                  case 'deleteTriple':
                    return a.entityId;
                  case 'editTriple':
                    return a.after.entityId;
                }
              });

              const networkEntity = networkEntities.find(e => A.isNotEmpty(entityIds) && e.id === A.head(entityIds));
              const triplesForNetworkEntity = networkEntity?.triples ?? [];
              return Triple.fromActions(actions, triplesForNetworkEntity);
            },
            Entity.entitiesFromTriples,
            A.filter(e => G.isString(e.name) && S.startsWith(S.toLowerCase(e.name), S.toLowerCase(this.query$.get())))
          );

          // We want to favor the local version of an entity if it exists on the network already.
          const localEntityIds = new Set(localEntities.map(e => e.id));

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
