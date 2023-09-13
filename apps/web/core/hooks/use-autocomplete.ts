'use client';

import { Observable, ObservableComputed, computed, observable } from '@legendapp/state';
import { useSelector } from '@legendapp/state/react';
import { A, S } from '@mobily/ts-belt';
import { Effect, Either } from 'effect';

import { useMemo } from 'react';

import { Subgraph } from '~/core/io';
import { Merged } from '~/core/merged';
import { Services } from '~/core/services';
import { ActionsStore, useActionsStoreInstance } from '~/core/state/actions-store';
import { makeOptionalComputed } from '~/core/utils/utils';

import { Environment } from '../environment';
import { LocalStore, useLocalStoreInstance } from '../state/local-store';
import { Entity as EntityType, FilterState } from '../types';

interface EntityAutocompleteOptions {
  spaceId?: string;
  ActionsStore: ActionsStore;
  LocalStore: LocalStore;
  subgraph: Subgraph.ISubgraph;
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

  constructor({ ActionsStore, LocalStore, allowedTypes, subgraph, config, filter = [] }: EntityAutocompleteOptions) {
    this.mergedDataSource = new Merged({
      store: ActionsStore,
      localStore: LocalStore,
      subgraph,
    });

    this.results$ = makeOptionalComputed(
      [],
      computed(async () => {
        this.abortController.abort();
        this.abortController = new AbortController();

        const query = this.query$.get();

        if (query.length === 0) return [];

        this.loading$.set(true);

        const merged = this.mergedDataSource;

        const fetchEntitiesEffect = Effect.either(
          Effect.tryPromiseInterrupt({
            try: () =>
              merged.fetchEntities({
                endpoint: config.subgraph,
                query,
                signal: this.abortController.signal,
                filter,
                typeIds: allowedTypes,
              }),
            catch: () => new Subgraph.Errors.AbortError(),
          })
        );

        const resultOrError = await Effect.runPromise(fetchEntitiesEffect);

        if (Either.isLeft(resultOrError)) {
          const error = resultOrError.left;

          switch (error._tag) {
            case 'AbortError':
              return [];
            default:
              throw error;
          }
        }

        this.loading$.set(false);
        return resultOrError.right;
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
  const { subgraph, config } = Services.useServices();
  const ActionsStore = useActionsStoreInstance();
  const LocalStore = useLocalStoreInstance();

  // @TODO(baiirun): fix this
  const stringifiedAllowedTypes = JSON.stringify(allowedTypes);
  const stringifiedFilter = JSON.stringify(filter);
  const memoizedAllowedTypes = useMemo(() => allowedTypes, [stringifiedAllowedTypes]);
  const memoizedFilter = useMemo(() => filter, [stringifiedFilter]);

  const autocomplete = useMemo(() => {
    return new EntityAutocomplete({
      ActionsStore,
      subgraph,
      config,
      LocalStore,
      filter: memoizedFilter,
      allowedTypes: memoizedAllowedTypes,
    });
    // Typically we wouldn't want to stringify a dependency array value, but since
    // we know that the FilterState object is small we know it won't create a performance issue.
  }, [ActionsStore, memoizedAllowedTypes, memoizedFilter, LocalStore, subgraph, config]);

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
