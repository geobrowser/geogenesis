import { computed, observable, ObservableComputed } from '@legendapp/state';
import { useSelector } from '@legendapp/state/react';
import { pipe, R } from '@mobily/ts-belt';
import { useEffect, useMemo } from 'react';
import { Services } from '~/modules/services';
import { INetwork } from '~/modules/services/network';
import { makeOptionalComputed } from '~/modules/utils';

export type EntityAutocompleteResult = {
  id: string;
  name: string | null;
};

class EntityAutocomplete {
  query$ = observable('');
  results$: ObservableComputed<EntityAutocompleteResult[]>;
  abortController: AbortController = new AbortController();

  constructor({ api }: { api: INetwork }) {
    const networkData$ = makeOptionalComputed(
      R.Ok<EntityAutocompleteResult[]>([]),
      computed(async () => {
        this.abortController.abort();
        this.abortController = new AbortController();

        return pipe(
          await R.fromPromise(api.fetchEntities(this.query$.get(), this.abortController)),

          // Right now we don't do anything with the error state.
          R.catchError(() => R.Error('Failed to fetch autocomplete entities'))
        );
      })
    );

    // If the result of the computed fetch is an error we default to an empty array.
    // Otherwise return the data.
    this.results$ = computed(() => R.getWithDefault(networkData$.get(), []));
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
