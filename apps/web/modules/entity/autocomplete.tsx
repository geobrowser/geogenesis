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
          const networkEntities = await api.fetchEntities(this.query$.get(), spaceId, this.abortController);

          const localEntities = pipe(
            ActionsStore.actions$.get(),
            D.values,
            A.flat,
            actions => Triple.fromActions(spaceId, actions, []),
            Entity.entitiesFromTriples,
            A.filter(e => G.isString(e.name) && S.startsWith(S.toLowerCase(e.name), S.toLowerCase(this.query$.get())))
          );

          // TODO: Dedupe
          return [...localEntities, ...networkEntities];
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
