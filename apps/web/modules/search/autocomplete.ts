import { computed, Observable, observable, ObservableComputed } from '@legendapp/state';
import { useSelector } from '@legendapp/state/react';
import { A, G, pipe, S } from '@mobily/ts-belt';
import { useMemo } from 'react';

import { Services } from '~/modules/services';
import { INetwork } from '~/modules/services/network';
import { makeOptionalComputed } from '~/modules/utils';
import { ActionsStore, useActionsStoreContext } from '../action';
import { Entity } from '../entity';
import { MergeDataSource } from '../services/io/merge-data-source';
import { Entity as EntityType, FilterState } from '../types';

interface EntityAutocompleteOptions {
  api: INetwork;
  spaceId?: string;
  ActionsStore: ActionsStore;
  filter?: FilterState;
}

class EntityAutocomplete {
  loading$: Observable<boolean> = observable(false);
  query$ = observable('');
  results$: ObservableComputed<EntityType[]>;
  abortController: AbortController = new AbortController();
  mergedDataSource: MergeDataSource;

  constructor({ api, spaceId, ActionsStore, filter = [] }: EntityAutocompleteOptions) {
    this.mergedDataSource = new MergeDataSource({ api, store: ActionsStore });

    this.results$ = makeOptionalComputed(
      [],
      computed(async () => {
        this.abortController.abort();
        this.abortController = new AbortController();

        try {
          const query = this.query$.get();

          if (query.length === 0) return [];

          this.loading$.set(true);
          return await this.mergedDataSource.fetchEntities({
            query,
            space: spaceId,
            abortController: this.abortController,
            filter,
          });
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

interface AutocompleteProps {
  spaceId?: string;
  filter?: FilterState;
}

export function useAutocomplete({ spaceId, filter }: AutocompleteProps) {
  const { network } = Services.useServices();
  const ActionsStore = useActionsStoreContext();

  const autocomplete = useMemo(() => {
    return new EntityAutocomplete({ api: network, spaceId, ActionsStore, filter });
    // Typically we wouldn't want to stringify a dependency array value, but since
    // we know that the FilterState object is small we know it won't create a performance issue.
  }, [network, spaceId, ActionsStore, JSON.stringify(filter)]);

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
