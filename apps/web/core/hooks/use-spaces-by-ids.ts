'use client';

import { type UseQueryResult, useQueries } from '@tanstack/react-query';

import * as React from 'react';

import type { Space } from '~/core/io/dto/spaces';
import { spaceByIdQueryOptions } from '~/core/io/space-batch-loader';

type UseSpacesByIdsResult = {
  spaces: Space[];
  spacesById: Map<string, Space>;
  /** True while any requested id is still unresolved. */
  isLoading: boolean;
};

const EMPTY_IDS: string[] = [];

/**
 * Spaces for a list of ids, cached per id so overlapping or growing sets never re-fetch a resolved
 * id; missing ids leave as one batched request. `enabled: false` still serves the cache.
 */
export function useSpacesByIds(spaceIds: string[] = [], enabled = true): UseSpacesByIdsResult {
  // Keyed on the ids' contents: callers build a fresh array each render, and a new `combine`
  // identity would rebuild the maps (and every memo downstream) on each one.
  const idsKey = [...new Set(spaceIds.filter(Boolean))].join('\n');
  const requestedIds = React.useMemo(() => (idsKey ? idsKey.split('\n') : EMPTY_IDS), [idsKey]);

  const combine = React.useCallback((results: UseQueryResult<Space | null>[]): UseSpacesByIdsResult => {
    const spaces: Space[] = [];
    const spacesById = new Map<string, Space>();
    for (const result of results) {
      if (!result.data || spacesById.has(result.data.id)) continue;
      spaces.push(result.data);
      spacesById.set(result.data.id, result.data);
    }
    return { spaces, spacesById, isLoading: results.some(result => result.isLoading) };
  }, []);

  return useQueries({
    queries: requestedIds.map(spaceId => ({ ...spaceByIdQueryOptions(spaceId), enabled })),
    combine,
  });
}
