'use client';

import { useSpaceType } from '~/core/hooks/use-space-type';

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
 * A settled answer either way, including when the lookup failed or the API doesn't know the space.
 * Treating those as `unknown` would leave debates loading forever; treating them as `not-indexed` at
 * least renders a state the reader can understand, and keeps a doomed request off the wire.
 */
function supportFrom(spaceId: string, isPending: boolean, type: string | undefined): SpaceDebateSupport {
  if (!spaceId) return 'not-indexed';
  if (isPending) return 'unknown';
  return type === 'DAO' ? 'indexed' : 'not-indexed';
}

/**
 * Reads the batched type lookup rather than the full space: a feed runs this once per card, and the
 * full space (members, editors, page entity) cost one request per space.
 */
export function useSpaceDebateSupport(spaceId: string): SpaceDebateSupport {
  const { data, isPending } = useSpaceType(spaceId, { enabled: Boolean(spaceId) });
  return supportFrom(spaceId, isPending, data ?? undefined);
}
