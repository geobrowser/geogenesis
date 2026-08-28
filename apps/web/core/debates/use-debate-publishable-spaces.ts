'use client';

import { useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { normId } from '~/core/utils/norm-id';

/**
 * The spaces a finished debate could actually be published into — the ones the acceptor edits.
 *
 * This is the authoritative answer to "can this claim carry a debate", and it is the one the
 * publish sweep acts on. `isDebatePublishableSpace` only ever approximated it: it can rule out a
 * personal space from the space type alone, but a *public* space the acceptor happens not to edit
 * fails in exactly the same way and is indistinguishable without this list.
 *
 * `null` means unknown — no acceptor configured, or the lookup failed. Callers must read that as
 * "don't filter on this", never as "nothing is publishable"; the alternative empties every list in
 * the picker on a transient error, and local environments run with no acceptor at all.
 */
export function useDebatePublishableSpaces(): {
  /** Normalized space ids, or null while unknown. */
  publishableSpaceIds: Set<string> | null;
  isLoading: boolean;
} {
  const { data, isLoading } = useQuery({
    queryKey: ['debates', 'publishable-spaces'],
    queryFn: async (): Promise<string[] | null> => {
      const response = await fetch('/api/debates/publishable-spaces');
      // Throw rather than return null, so an HTTP failure is a *retryable* error instead of a
      // cached "unknown". Returning null here made a single blip a settled answer for the session.
      if (!response.ok) throw new Error(`publishable spaces: ${response.status}`);
      const body = (await response.json()) as { spaceIds?: string[] | null };
      return body.spaceIds ?? null;
    },
    // Editor sets change when someone is added to a space. Refetching this per mount would spend a
    // request on an answer that is the same all session — but only once there *is* an answer:
    // `null` means the lookup could not be made, and holding that for five minutes keeps the
    // filter off long after the upstream recovered. So a null is stale immediately.
    staleTime: query => (query.state.data == null ? 0 : 5 * 60_000),
    // Was `false`, which meant one transient 503 dropped the space filter entirely and nothing
    // tried again. Both gates fail open on `null`, so a failed lookup silently widens the claims
    // corpus rather than narrowing it — the failure mode that hides a retry being absent.
    retry: 2,
    retryDelay: attempt => Math.min(1_000 * 2 ** attempt, 5_000),
  });

  const publishableSpaceIds = React.useMemo(
    () => (data ? new Set(data.map(normId)) : null),
    [data]
  );

  return { publishableSpaceIds, isLoading };
}

/**
 * Whether a debate on a claim in this space could be published, given whatever the lookup knows.
 *
 * Ids are normalized on both sides: a claim row carries the spelling the graph was queried with,
 * while the editor list carries the spelling the API answered with, and the two differ by dashes.
 */
export function isSpaceDebatePublishable(spaceId: string | null | undefined, publishable: Set<string> | null): boolean {
  if (publishable === null) return true;
  if (!spaceId) return false;
  return publishable.has(normId(spaceId));
}
