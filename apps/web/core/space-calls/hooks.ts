'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useDebateGatewayScope } from '~/core/debates/debate-gateway';
import { debateQueryKeys, debateQueryNetworkOptions, useGeoChatAuth } from '~/core/debates/hooks';

import { type SpaceCallsResponse, listSpaceCalls, startSpaceCall } from './api';
import { spaceCallKeys } from './query-keys';

/** An emptied room closes this long after its last person leaves; a scheduled one not before its start plus this. */
const CALL_IDLE_CLOSE_MS = 15 * 60_000;
/** Past a transition, so the read lands after geo-chat has made it. */
const TRANSITION_SLACK_MS = 2_000;
/** A transition already due that the list does not show yet is read again after this. */
const OVERDUE_REFETCH_MS = 30_000;
/** Below `setTimeout`'s 24.8-day limit; a later transition is read again on focus anyway. */
const MAX_REFETCH_MS = 6 * 60 * 60_000;

/**
 * When the list next changes by the clock alone: a scheduled call opens, or a live call can close.
 * A call started or a schedule edited elsewhere comes on focus instead. `false` when nothing is due.
 */
export function nextSpaceCallsRefetch(data: SpaceCallsResponse | undefined, now: number): number | false {
  if (!data?.supported) return false;
  let next = Infinity;
  for (const call of data.calls) {
    const status = call.status ?? 'live';
    if (status === 'scheduled') {
      const opens = Date.parse(call.opens_at ?? '');
      if (!Number.isNaN(opens)) next = Math.min(next, opens);
    } else if (status === 'live') {
      // Its emptying is not on the list, so a live call is read again every idle window.
      const held = call.ends_at ? Date.parse(call.starts_at ?? '') + CALL_IDLE_CLOSE_MS : NaN;
      next = Math.min(next, held > now ? held : now + CALL_IDLE_CLOSE_MS);
    }
  }
  if (next === Infinity) return false;
  if (next <= now) return OVERDUE_REFETCH_MS;
  return Math.min(next - now + TRANSITION_SLACK_MS, MAX_REFETCH_MS);
}

/** Signed in the gateway keeps the list current; a one-off read (`live: false`) never refetches. */
export function spaceCallsRefetchInterval(
  { authenticated, live }: { authenticated: boolean; live: boolean },
  data: SpaceCallsResponse | undefined,
  now: number
): number | false {
  return authenticated || !live ? false : nextSpaceCallsRefetch(data, now);
}

/**
 * A space's live calls and whether the viewer may start one (GEO-3419). Signed in, kept current by
 * `debate.space_calls_changed` on the space scope; signed out, read again at the next transition
 * and on focus, never while hidden. `live: false` reads it once.
 */
export function useSpaceCalls(spaceId: string, enabled = true, { live = true }: { live?: boolean } = {}) {
  const { accountKey, authenticated, ready, getPrivyIdentityToken } = useGeoChatAuth();
  const viewerKey = authenticated ? accountKey : null;
  useDebateGatewayScope({ scope: 'space', space_id: spaceId }, enabled && live && authenticated);

  return useQuery({
    ...debateQueryNetworkOptions,
    queryKey: spaceCallKeys.viewerList(spaceId, viewerKey),
    queryFn: ({ signal }) => listSpaceCalls(spaceId, getPrivyIdentityToken, viewerKey, signal),
    enabled: enabled && ready && Boolean(spaceId),
    refetchOnWindowFocus: live && !authenticated,
    refetchInterval: query => spaceCallsRefetchInterval({ authenticated, live }, query.state.data, Date.now()),
  });
}

/** Starts a call and stores its view, so the call page opens on it without a second read. */
export function useStartSpaceCall(spaceId: string) {
  const { accountKey, getPrivyIdentityToken } = useGeoChatAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => startSpaceCall(spaceId, {}, getPrivyIdentityToken, accountKey),
    onSuccess: view => {
      queryClient.setQueryData(debateQueryKeys.lobby(accountKey, view.lobby_id), view);
      void queryClient.invalidateQueries({ queryKey: spaceCallKeys.list(spaceId) });
    },
  });
}
