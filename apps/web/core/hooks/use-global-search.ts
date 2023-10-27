'use client';

import { Observable, ObservableComputed, computed, observable } from '@legendapp/state';
import { useSelector } from '@legendapp/state/react';
import { A, S } from '@mobily/ts-belt';
import * as Effect from 'effect/Effect';
import * as Either from 'effect/Either';

import { useMemo } from 'react';

import { Subgraph } from '~/core/io';
import { Merged } from '~/core/merged';
import { Services } from '~/core/services';
import { ActionsStore } from '~/core/state/actions-store/actions-store';
import { makeOptionalComputed } from '~/core/utils/utils';

import { Environment } from '../environment';
import { useActionsStoreInstance } from '../state/actions-store/actions-store-provider';
import { LocalStore, useLocalStoreInstance } from '../state/local-store';
import { Entity as EntityType } from '../types';

interface GlobalSearchOptions {
  ActionsStore: ActionsStore;
  LocalStore: LocalStore;
  subgraph: Subgraph.ISubgraph;
}

class GlobalSearch {
  loading$: Observable<boolean> = observable(false);
  query$ = observable('');
  results$: ObservableComputed<EntityType[]>;
  abortController: AbortController = new AbortController();
  mergedDataSource: Merged;

  constructor({ ActionsStore, LocalStore, subgraph }: GlobalSearchOptions) {
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
          Effect.tryPromise({
            try: () =>
              merged.fetchEntities({
                endpoint: Environment.getConfig(process.env.NEXT_PUBLIC_APP_ENV).subgraph,
                query,
                signal: this.abortController.signal,
                filter: [],
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

export function useGlobalSearch() {
  const { subgraph } = Services.useServices();
  const ActionsStore = useActionsStoreInstance();
  const LocalStore = useLocalStoreInstance();

  const autocomplete = useMemo(() => {
    return new GlobalSearch({
      ActionsStore,
      subgraph,
      LocalStore,
    });
    // Typically we wouldn't want to stringify a dependency array value, but since
    // we know that the FilterState object is small we know it won't create a performance issue.
  }, [ActionsStore, LocalStore, subgraph]);

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
