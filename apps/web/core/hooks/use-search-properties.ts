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
  /** Filter results to properties whose base dataType equals this. Optional. */
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
  /** Initial query string to seed the search input. */
  initialQuery?: string;
}

/**
 * Property-aware wrapper around `useSearch`. Adds client-side filtering for
 * `dataType`, `renderableType`, and required `relationValueTypes`.
 *
 * Hydration cost: each unique result is looked up in the local store first; on
 * miss we fall back to the network `getProperty`. RELATION-typed results also
 * pull entity relations via `hydrateRelationValueTypes` so the value-type
 * filter is reliable.
 */
export function useSearchProperties({
  dataType,
  renderableTypeId,
  requiredRelationValueTypeIds,
  initialQuery,
}: UseSearchPropertiesOptions = {}) {
  const { store } = useSyncEngine();

  const search = useSearch({
    filterByTypes: [SystemIds.PROPERTY],
    initialQuery,
  });

  // Cache hydrated properties by ID across query changes so we don't re-fetch
  // the same property on every keystroke.
  const cacheRef = React.useRef<Map<string, Property | null>>(new Map());
  // `cacheVersion` is bumped whenever `cacheRef` is mutated. The `useMemo`s
  // below MUST include it in their deps — otherwise React keeps returning the
  // previously-cached filter result even though the underlying ref has new
  // entries, leaving the dropdown stuck on "Loading…"/empty forever.
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

    // Seed entries we can resolve synchronously from the store to avoid an
    // unnecessary network round-trip + re-render. RELATION properties with an
    // empty `relationValueTypes` are intentionally NOT trusted: cross-space
    // sync (engine.ts calls getBatchEntities without a spaceId) often leaves
    // those relations unloaded, so the store would lie by omission. Route
    // those through the network path so the async branch can hydrate them.
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

    // Fetch the rest in parallel.
    void Promise.all(
      remaining.map(async r => {
        try {
          const fetched = await Effect.runPromise(getProperty(r.id));
          if (!fetched) {
            cache.set(r.id, null);
            return;
          }
          // `getProperty` reliably returns dataType + renderableType, but the
          // GraphQL decoder leaves `relationValueTypes` empty. Hydrate it when
          // we'll need to filter by it.
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
      // While hydration is in flight, keep the entry out of view rather than
      // letting it flicker between unfiltered → filtered states.
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

  // Any result whose hydration is still pending counts toward `isLoading` so
  // the UI can show a spinner instead of a stale "no matches" state.
  const isHydrating = React.useMemo(() => {
    const cache = cacheRef.current;
    return search.results.some(r => !cache.has(r.id));
  }, [search.results, cacheVersion]);

  return {
    query: search.query,
    onQueryChange: search.onQueryChange,
    isLoading: search.isLoading || isHydrating,
    isEmpty: !search.isLoading && !isHydrating && filteredResults.length === 0 && search.query !== '',
    results: filteredResults,
  };
}
