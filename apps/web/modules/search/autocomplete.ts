import { computed, Observable, observable, ObservableComputed } from '@legendapp/state';
import { useSelector } from '@legendapp/state/react';
import { A, S } from '@mobily/ts-belt';
import { useMemo } from 'react';

import { Services } from '~/modules/services';
import { makeOptionalComputed } from '~/modules/utils';
import { ActionsStore, useActionsStoreContext } from '../action';
import { Entity as EntityType, FilterState } from '../types';
import { MergedData, NetworkData } from '~/modules/io';

interface EntityAutocompleteOptions {
  api: NetworkData.INetwork;
  spaceId?: string;
  ActionsStore: ActionsStore;
  filter?: FilterState;
  allowedTypes?: string[];
}

class EntityAutocomplete {
  loading$: Observable<boolean> = observable(false);
  query$ = observable('');
  results$: ObservableComputed<EntityType[]>;
  abortController: AbortController = new AbortController();
  mergedDataSource: MergedData;

  constructor({ api, ActionsStore, allowedTypes, filter = [] }: EntityAutocompleteOptions) {
    this.mergedDataSource = new MergedData({ api, store: ActionsStore });

    this.results$ = makeOptionalComputed(
      [],
      computed(async () => {
        this.abortController.abort();
        this.abortController = new AbortController();

        try {
          const query = this.query$.get();

          if (query.length === 0) return [];

          this.loading$.set(true);
          const entities = await this.mergedDataSource.fetchEntities({
            query,
            abortController: this.abortController,
            filter,
            typeIds: allowedTypes,
          });
          this.loading$.set(false);
          return entities;
        } catch (e) {
          console.log("Couldn't fetch entities", e);
          return [];
        }
      })
    );
  }

  onQueryChange = (query: string) => {
    this.query$.set(query);
  };
}

interface AutocompleteOptions {
  filter?: FilterState;
  allowedTypes?: string[];
}

export function useAutocomplete({ allowedTypes, filter = [] }: AutocompleteOptions = {}) {
  const { network } = Services.useServices();
  const ActionsStore = useActionsStoreContext();

  const autocomplete = useMemo(() => {
    return new EntityAutocomplete({ api: network, ActionsStore, filter, allowedTypes });
    // Typically we wouldn't want to stringify a dependency array value, but since
    // we know that the FilterState object is small we know it won't create a performance issue.
  }, [network, ActionsStore, allowedTypes, JSON.stringify(filter)]);

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
