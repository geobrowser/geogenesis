import { computed, observable, ObservableComputed } from '@legendapp/state';
import { useSelector } from '@legendapp/state/react';
import { useEffect, useMemo } from 'react';
import { Services } from '~/modules/services';
import { INetwork } from '~/modules/services/network';
import { makeOptionalComputed } from '~/modules/utils';
import { Entity } from '../types';

class EntityAutocomplete {
  query$ = observable('');
  results$: ObservableComputed<Entity[]>;
  abortController: AbortController = new AbortController();

  constructor({ api, spaceId }: { api: INetwork; spaceId: string }) {
    this.results$ = makeOptionalComputed(
      [],
      computed(async () => {
        this.abortController.abort();
        this.abortController = new AbortController();

        try {
          return await api.fetchEntities(this.query$.get(), spaceId, this.abortController);
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

  const autocomplete = useMemo(() => {
    return new EntityAutocomplete({ api: network, spaceId });
  }, [network, spaceId]);

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
