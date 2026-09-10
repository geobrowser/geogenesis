'use client';

import { useQueries } from '@tanstack/react-query';

import * as React from 'react';

import { NAME_BATCH_SIZE, dropdownIdKey, fetchDropdownOptionNames, fingerprintIdList } from './fetch-dropdown-options';

/**
 * Names for dropdown options, fetched lazily: the facet answers in ids, and
 * a menu row needs a word. Requested per revealed window (plus everything
 * when a search needs the whole list), batched, and kept in a module-level
 * cache — names do not change on the timescale of a filter click, and the
 * cache makes re-opening any menu free.
 */
const nameCache = new Map<string, string | null>();

/** Test-only: drop the shared cache so specs are isolated. */
export function __resetDropdownNameCacheForTests() {
  nameCache.clear();
}

export function useDropdownOptionNames({ ids, enabled }: { ids: string[]; enabled: boolean }) {
  const missing: string[] = [];
  const missingSeen = new Set<string>();
  for (const id of ids) {
    const key = dropdownIdKey(id);
    if (nameCache.has(key) || missingSeen.has(key)) continue;
    missingSeen.add(key);
    missing.push(key);
  }
  missing.sort();

  const chunks: string[][] = [];
  for (let start = 0; start < missing.length; start += NAME_BATCH_SIZE) {
    chunks.push(missing.slice(start, start + NAME_BATCH_SIZE));
  }

  // One query per chunk so a large request (search across a huge facet)
  // resolves progressively instead of all-or-nothing.
  const results = useQueries({
    queries: chunks.map(chunk => ({
      queryKey: ['data-block', 'dropdown-option-names', fingerprintIdList(chunk)],
      queryFn: async ({ signal }: { signal?: AbortSignal }) => {
        const fetched = await fetchDropdownOptionNames(chunk, signal);
        for (const [key, name] of fetched) nameCache.set(key, name);
        // An id the API returned nothing for stays unnamed rather than
        // re-requested forever.
        for (const key of chunk) if (!nameCache.has(key)) nameCache.set(key, null);
        return fetched.size;
      },
      enabled,
      staleTime: Infinity,
      refetchOnWindowFocus: false,
      retry: 1,
    })),
  });

  const loadingNames = enabled && results.some(result => result.isLoading);

  // Stable identities reading the mutable cache — consumers memoize against
  // `loadingNames` (which flips as batches land) rather than these.
  const nameOf = React.useCallback((id: string): string | null => nameCache.get(dropdownIdKey(id)) ?? null, []);
  const hasName = React.useCallback((id: string): boolean => nameCache.has(dropdownIdKey(id)), []);
  return { nameOf, hasName, loadingNames };
}
