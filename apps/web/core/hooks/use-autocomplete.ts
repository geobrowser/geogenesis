'use client';

import { Observable, ObservableComputed, computed, observable } from '@legendapp/state';
import { useSelector } from '@legendapp/state/react';
import { A, S } from '@mobily/ts-belt';

import { useMemo } from 'react';

import { Network, Subgraph } from '~/core/io';
import { Merged } from '~/core/merged';
import { Services } from '~/core/services';
import { ActionsStore, useActionsStoreInstance } from '~/core/state/actions-store';
import { makeOptionalComputed } from '~/core/utils/utils';

import { Environment } from '../environment';
import { LocalStore, useLocalStoreInstance } from '../state/local-store';
import { Entity as EntityType, FilterState } from '../types';

interface EntityAutocompleteOptions {
  api: Network.INetwork;
  spaceId?: string;
  ActionsStore: ActionsStore;
  LocalStore: LocalStore;
  Subgraph: Subgraph.ISubgraph;
  config: Environment.AppConfig;
  filter?: FilterState;
  allowedTypes?: string[];
}

class EntityAutocomplete {
  loading$: Observable<boolean> = observable(false);
  query$ = observable('');
  results$: ObservableComputed<EntityType[]>;
  abortController: AbortController = new AbortController();
  mergedDataSource: Merged;

  constructor({
    api,
    ActionsStore,
    LocalStore,
    allowedTypes,
    Subgraph,
    config,
    filter = [],
  }: EntityAutocompleteOptions) {
    this.mergedDataSource = new Merged({
      api,
      store: ActionsStore,
      localStore: LocalStore,
      subgraph: Subgraph,
      config,
    });

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
          if (e instanceof Error && e.name === 'AbortError') {
            // eslint-disable-next-line @typescript-eslint/no-empty-function
            return new Promise(() => {});
          }

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

export function useAutocomplete({ allowedTypes, filter }: AutocompleteOptions = {}) {
  const { network, subgraph, config } = Services.useServices();
  const ActionsStore = useActionsStoreInstance();
  const LocalStore = useLocalStoreInstance();

  // @TODO(baiirun): fix this
  const memoizedAllowedTypes = useMemo(() => allowedTypes, [JSON.stringify(allowedTypes)]);
  const memoizedFilter = useMemo(() => filter, [JSON.stringify(filter)]);

  const autocomplete = useMemo(() => {
    return new EntityAutocomplete({
      api: network,
      ActionsStore,
      Subgraph: subgraph,
      config,
      LocalStore,
      filter: memoizedFilter,
      allowedTypes: memoizedAllowedTypes,
    });
    // Typically we wouldn't want to stringify a dependency array value, but since
    // we know that the FilterState object is small we know it won't create a performance issue.
  }, [network, ActionsStore, memoizedAllowedTypes, memoizedFilter, LocalStore, subgraph, config]);

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
