'use client';

import { useInfiniteQuery } from '@tanstack/react-query';

import { type DebateLobbyPerson, dashlessId, geoChatRequest } from '~/core/debates/api';
import { debateQueryNetworkOptions } from '~/core/debates/hooks';

import { spacePastCallsQueryKey } from '../query-keys';

/** An ended call of a space, recorded or not (`GET /calls/past?space_id=`, GEO-3421). */
export type SpacePastCall = {
  call_id: string;
  name: string;
  started_at: string;
  ended_at: string;
  /** End minus start, whole seconds. */
  duration_seconds: number | null;
  started_by: DebateLobbyPerson | null;
  /** Set only when published and ready. */
  recording: { duration_seconds: number | null } | null;
};

export type SpacePastCallsPage = { calls: SpacePastCall[]; next_cursor: string | null };

export const SPACE_PAST_CALLS_PAGE = 20;

/** Public; newest end first. Pass `next_cursor` back with the same space. */
export async function listSpacePastCalls(spaceId: string, cursor: string | null, signal?: AbortSignal) {
  const params = new URLSearchParams({ space_id: dashlessId(spaceId), limit: String(SPACE_PAST_CALLS_PAGE) });
  if (cursor) params.set('cursor', cursor);
  return geoChatRequest<SpacePastCallsPage>(`/calls/past?${params}`, { auth: false, signal });
}

/** A space's past calls, a page at a time (GEO-3420). */
export function useSpacePastCalls(spaceId: string, enabled = true) {
  return useInfiniteQuery({
    ...debateQueryNetworkOptions,
    queryKey: spacePastCallsQueryKey(spaceId),
    queryFn: ({ pageParam, signal }) => listSpacePastCalls(spaceId, pageParam, signal),
    initialPageParam: null as string | null,
    getNextPageParam: page => page.next_cursor,
    enabled: enabled && Boolean(spaceId),
  });
}
