'use client';

import { useQuery } from '@tanstack/react-query';

import { Effect } from 'effect';

import { getSpace } from '~/core/io/queries';

/**
 * Whether geo-chat indexes a space, as far as we can tell right now.
 *
 * geo-chat indexes DAO spaces only: asked about a personal space it answers `space_not_found`. This
 * keeps that request off the wire for the single-space callers — an entity page, the claims page,
 * the browse feed — where the space being rendered is simply the wrong one to ask about.
 *
 * Not a filter on gateway scopes. A scope-level rejection used to park the socket in the degraded
 * state behind "Live debate updates are paused while reconnecting" with no reconnect scheduled,
 * which is what this began as a defence against; `debate-gateway.ts` now recycles the socket
 * instead (GEO-2650). The rematch picker deliberately holds scopes on both participants' personal
 * spaces, and narrowing those would cost the opponent's first position.
 *
 * Three-valued on purpose. The gate has to hold while the space type is still resolving — guessing
 * "indexed" fires the request it exists to avoid. But a boolean can only express that hold by
 * answering "not indexed", and a *disabled* react-query reports `isLoading: false` with no data:
 * indistinguishable from a settled empty result. Every consumer then paints its own terminal empty
 * state — "No debates to watch yet", "No claims are available to debate yet", or, on the browse
 * feed, the ordinary entity page in place of the video takeover — and swaps it out a round trip
 * later. `unknown` is what lets callers hold instead, by folding it into the `isLoading` they
 * already hand their consumers.
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
