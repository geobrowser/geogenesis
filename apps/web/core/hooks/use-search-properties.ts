'use client';

import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import * as React from 'react';

import { Effect } from 'effect';

import { getProperty } from '~/core/io/queries';
import { useSyncEngine } from '~/core/sync/use-sync-engine';
import { DataType, Property, SearchResult } from '~/core/types';

import { hydrateRelationValueTypes } from '~/partials/import/import-generation';

import { useSearch } from './use-search';

interface UseSearchPropertiesOptions {
  /** Filter results to properties whose base dataType equals this. */
  dataType?: DataType;
  /**
   * Filter results to properties whose renderable type ID matches.
   * Pass `null` to require renderableType to be absent (i.e. "None").
   * Omit to skip this filter.
   */
  renderableTypeId?: string | null;
  /**
   * Require that the property's `relationValueTypes` includes every ID in this
   * list. Only meaningful for RELATION properties.
   */
  requiredRelationValueTypeIds?: string[];
  /**
   * When true, run the search even with an empty query — REST `/search`
   * returns the top-N PROPERTY-typed entities, which we then post-filter by
   * dataType to give the popover a pre-populated list on open.
   */
  enabled?: boolean;
}

/**
 * Page size we ask `useSearch` for. The REST endpoint returns top PROPERTY
 * entities sorted by relevance, but they span every `dataType` (TEXT, RELATION,
 * BOOLEAN, etc.). With the default page of 10 the post-hydration `dataType`
 * filter often yields 0-2 rows. 30 gives the filter a wider candidate pool
 * without blowing up the initial network cost.
 */
const PROPERTY_SEARCH_PAGE_SIZE = 30;

/**
 * Minimum filtered-result count we'll accept before triggering another page
 * fetch. Below this threshold we ask for more pages so a narrow filter (e.g.
 * "RELATION → Person") still has a chance to surface matches.
 */
const MIN_FILTERED_RESULTS = 5;

/**
 * Max number of times we'll pump pages chasing more matches. Without this, a
 * very narrow filter would walk the entire result set page by page.
 */
const MAX_FILTER_PUMP = 5;

/**
 * Property-aware wrapper around `useSearch`. Adds client-side filtering for
 * `dataType`, `renderableType`, and required `relationValueTypes`, hydrates
 * each candidate via local store (or network) so those fields are reliable,
 * and auto-paginates when the filter yields too few rows.
 */
export function useSearchProperties({
  dataType,
  renderableTypeId,
  requiredRelationValueTypeIds,
  enabled,
}: UseSearchPropertiesOptions = {}) {
  const { store } = useSyncEngine();

  const search = useSearch({
    filterByTypes: [SystemIds.PROPERTY],
    enabled,
    pageSize: PROPERTY_SEARCH_PAGE_SIZE,
  });

  const cacheRef = React.useRef<Map<string, Property | null>>(new Map());
  // Bump whenever `cacheRef` mutates so the downstream `useMemo`s recompute.
  // Without this they lock onto a stale result and never refresh after
  // hydration completes.
  const [cacheVersion, bumpCacheVersion] = React.useReducer((x: number) => x + 1, 0);

  const resultIdsKey = search.results.map(r => r.id).join(',');

  React.useEffect(() => {
    let cancelled = false;
    const cache = cacheRef.current;

    const needsHydration: SearchResult[] = [];
    for (const r of search.results) {
      if (cache.has(r.id)) continue;
      needsHydration.push(r);
    }

    if (needsHydration.length === 0) return;

    // Seed cache from the local store when we can resolve synchronously. We
    // intentionally route RELATION properties with empty `relationValueTypes`
    // through the network path — cross-space sync sometimes leaves those
    // relations unloaded, so the store would lie by omission.
    const remaining: SearchResult[] = [];
    for (const r of needsHydration) {
      const fromStore = store.getProperty(r.id);
      const storeHitIsComplete =
        fromStore && (fromStore.dataType !== 'RELATION' || (fromStore.relationValueTypes?.length ?? 0) > 0);
      if (storeHitIsComplete) {
        cache.set(r.id, fromStore);
      } else {
        remaining.push(r);
      }
    }

    if (remaining.length === 0) {
      bumpCacheVersion();
      return;
    }

    void Promise.all(
      remaining.map(async r => {
        try {
          const fetched = await Effect.runPromise(getProperty(r.id));
          if (!fetched) {
            cache.set(r.id, null);
            return;
          }
          // GraphQL decoder leaves `relationValueTypes` empty; hydrate it for
          // RELATION properties so the filter is reliable.
          const hydrated = fetched.dataType === 'RELATION' ? await hydrateRelationValueTypes(fetched) : fetched;
          cache.set(r.id, hydrated);
        } catch {
          cache.set(r.id, null);
        }
      })
    ).then(() => {
      if (!cancelled) bumpCacheVersion();
    });

    return () => {
      cancelled = true;
    };
  }, [resultIdsKey, search.results, store]);

  const filteredResults = React.useMemo(() => {
    const cache = cacheRef.current;
    return search.results.filter(r => {
      const property = cache.get(r.id);
      if (property === undefined || property === null) return false;

      if (dataType && property.dataType !== dataType) return false;

      if (renderableTypeId !== undefined) {
        const actual = property.renderableType ?? null;
        if (actual !== renderableTypeId) return false;
      }

      if (requiredRelationValueTypeIds && requiredRelationValueTypeIds.length > 0) {
        const have = new Set((property.relationValueTypes ?? []).map(t => t.id));
        for (const required of requiredRelationValueTypeIds) {
          if (!have.has(required)) return false;
        }
      }

      return true;
    });
  }, [search.results, dataType, renderableTypeId, requiredRelationValueTypeIds, cacheVersion]);

  const isHydrating = React.useMemo(() => {
    const cache = cacheRef.current;
    return search.results.some(r => !cache.has(r.id));
  }, [search.results, cacheVersion]);

  // Pump additional pages when the post-hydration filter is too narrow.
  // `useSearch` already pumps when its REST-side filter strips a page to
  // empty, but our filter runs *after* that and can shrink the page further.
  // Wait for hydration of the current page to finish before deciding whether
  // to ask for more, and reset the pump counter whenever the query changes so
  // each new search gets a fresh budget.
  const pumpCountRef = React.useRef(0);
  React.useEffect(() => {
    pumpCountRef.current = 0;
  }, [search.query, dataType, renderableTypeId, requiredRelationValueTypeIds]);

  const pumpsExhausted = pumpCountRef.current >= MAX_FILTER_PUMP;

  React.useEffect(() => {
    if (isHydrating) return;
    if (search.isFetchingNextPage) return;
    if (!search.hasNextPage) return;
    if (filteredResults.length >= MIN_FILTERED_RESULTS) return;
    if (pumpCountRef.current >= MAX_FILTER_PUMP) return;
    pumpCountRef.current += 1;
    void search.fetchNextPage();
  }, [
    isHydrating,
    filteredResults.length,
    search.hasNextPage,
    search.isFetchingNextPage,
    search.fetchNextPage,
  ]);

  return {
    query: search.query,
    onQueryChange: search.onQueryChange,
    isLoading: search.isLoading || isHydrating || search.isFetchingNextPage,
    isEmpty:
      !search.isLoading &&
      !isHydrating &&
      !search.isFetchingNextPage &&
      (!search.hasNextPage || pumpsExhausted) &&
      filteredResults.length === 0 &&
      (Boolean(enabled) || search.query !== ''),
    results: filteredResults,
  };
}
