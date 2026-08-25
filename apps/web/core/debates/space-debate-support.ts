'use client';

import { useQueries, useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { Effect } from 'effect';

import { getSpace } from '~/core/io/queries';

/**
 * Whether geo-chat indexes a space, as far as we can tell right now.
 *
 * Three-valued on purpose. geo-chat indexes DAO spaces only: asked about a personal space it
 * answers `space_not_found`, and the gateway rejects the matching SUBSCRIBE, which drops the socket
 * into a degraded state that raises "Live debate updates are paused while reconnecting" and never
 * clears it, because a scope-level rejection schedules no reconnect (`debate-gateway.ts`).
 *
 * So the gate has to hold while the space type is still resolving — guessing "indexed" fires the
 * request it exists to avoid. But a boolean can only express that hold by answering "not indexed",
 * and a *disabled* react-query reports `isLoading: false` with no data: indistinguishable from a
 * settled empty result. Every consumer then paints its own terminal empty state — "No debates to
 * watch yet", "No claims are available to debate yet", or, on the browse feed, the ordinary entity
 * page in place of the video takeover — and swaps it out a round trip later. `unknown` is what lets
 * callers hold instead, by folding it into the `isLoading` they already hand their consumers.
 */
export type SpaceDebateSupport = 'indexed' | 'not-indexed' | 'unknown';

/**
 * A space's type doesn't change under a reader, and this now runs once per claim row. `getSpace`
 * pulls the whole space — members, editors, its page entity — so without this the gate refetches
 * all of it per row mount and on every window focus.
 */
const SPACE_TYPE_STALE_TIME = 5 * 60_000;

/** Shares `useSpace`'s cache key, so the answer is usually already warm and costs no extra fetch. */
function spaceQueryOptions(spaceId: string) {
  return {
    queryKey: ['space', spaceId],
    queryFn: () => (spaceId ? Effect.runPromise(getSpace(spaceId)) : null),
    enabled: Boolean(spaceId),
    staleTime: SPACE_TYPE_STALE_TIME,
  };
}

/**
 * A settled answer either way, including when the lookup failed. `getSpace` resolves to `null` for
 * a space the API doesn't know, and `SpaceDecoder.decode` also returns `null` on a schema mismatch —
 * a query *success*, so react-query never retries it. Treating any of those as `unknown` would leave
 * debates loading forever on a space whose payload merely tripped one field; treating them as
 * `not-indexed` at least renders a state the reader can understand, and keeps a doomed request off
 * the wire either way.
 */
function supportFrom(spaceId: string, isPending: boolean, type: string | undefined): SpaceDebateSupport {
  if (!spaceId) return 'not-indexed';
  if (isPending) return 'unknown';
  return type === 'DAO' ? 'indexed' : 'not-indexed';
}

export function useSpaceDebateSupport(spaceId: string): SpaceDebateSupport {
  const { data, isPending } = useQuery(spaceQueryOptions(spaceId));
  return supportFrom(spaceId, isPending, data?.type);
}

/**
 * The same question for a list of spaces, for callers holding claims from more than one — the
 * rematch picker builds its rows from whatever space each claim lives in, which for a claim whose
 * home space is personal is a space geo-chat has no row for.
 *
 * `isPending` is true while any space is still resolving, so callers can hold the whole list rather
 * than subscribing to the ones that happen to have answered first.
 */
export function useDebateIndexedSpaceIds(spaceIds: string[]): { indexed: string[]; isPending: boolean } {
  const unique = React.useMemo(() => [...new Set(spaceIds)].sort((a, b) => a.localeCompare(b)), [spaceIds]);

  // Stable by contract: react-query re-runs `combine` whenever its identity changes, and diffs the
  // result with `replaceEqualDeep` so callers' memos survive.
  const combine = React.useCallback(
    (results: Array<{ data?: { type: string } | null; isPending: boolean }>) => ({
      indexed: unique.filter(
        (spaceId, index) => supportFrom(spaceId, results[index]!.isPending, results[index]!.data?.type) === 'indexed'
      ),
      isPending: unique.some(
        (spaceId, index) => supportFrom(spaceId, results[index]!.isPending, results[index]!.data?.type) === 'unknown'
      ),
    }),
    [unique]
  );

  return useQueries({ queries: unique.map(spaceQueryOptions), combine });
}
