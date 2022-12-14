import { computed, observable, ObservableComputed } from '@legendapp/state';
import { useSelector } from '@legendapp/state/react';
import { useEffect, useMemo } from 'react';
import { useServices } from '~/modules/services';
import { INetwork } from '~/modules/services/network';
import { makeOptionalComputed } from '~/modules/utils';

class EntityAutocomplete {
  query$ = observable('');
  results$: ObservableComputed<{ id: string; name: string | null }[]>;

  constructor({ api }: { api: INetwork }) {
    this.results$ = makeOptionalComputed(
      [],
      computed(async () => await api.fetchEntities(this.query$.get()))
    );
  }

  onQueryChange = (query: string) => {
    this.query$.set(query);
  };
}

export function useAutocomplete() {
  const { network } = useServices();

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
