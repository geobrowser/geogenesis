import { computed, observable, ObservableComputed } from '@legendapp/state';
import { useSelector } from '@legendapp/state/react';
import { useEffect, useMemo } from 'react';
import { Services } from '~/modules/services';
import { INetwork } from '~/modules/services/network';
import { makeOptionalComputed } from '~/modules/utils';

class EntityAutocomplete {
  query$ = observable('');
  results$: ObservableComputed<{ id: string; name: string | null }[]>;
  abortController: AbortController = new AbortController();

  constructor({ api }: { api: INetwork }) {
    this.results$ = makeOptionalComputed(
      [],
      computed(async () => {
        this.abortController.abort();
        this.abortController = new AbortController();

        return await api.fetchEntities(this.query$.get(), this.abortController);
      })
    );
  }

  onQueryChange = (query: string) => {
    this.query$.set(query);
  };
}

export function useAutocomplete() {
  const { network } = Services.useServices();

  const autocomplete = useMemo(() => {
    return new EntityAutocomplete({ api: network });
  }, [network]);

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
