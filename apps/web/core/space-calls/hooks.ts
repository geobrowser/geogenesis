'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useDebateGatewayScope } from '~/core/debates/debate-gateway';
import { debateQueryKeys, debateQueryNetworkOptions, useGeoChatAuth } from '~/core/debates/hooks';

import { type SpaceCallsResponse, listSpaceCalls, startSpaceCall } from './api';
import { spaceCallKeys } from './query-keys';

/** Signed-out visitors get no gateway events, so a call started on the spot shows within this. */
export const SIGNED_OUT_SPACE_CALLS_POLL_MS = 3 * 60_000;
/** A scheduled call is held open until its start plus this. */
const CALL_HOLD_OPEN_MS = 15 * 60_000;
/** Past a transition, so the read lands after geo-chat has made it. */
const TRANSITION_SLACK_MS = 2_000;
/** A transition already due that the list does not show yet is read again after this. */
const OVERDUE_REFETCH_MS = 30_000;

/**
 * The signed-out poll, sooner when a scheduled call opens or a held one can close first. React
 * Query skips it while the tab is hidden. `false` for a space without calls, which cannot gain one.
 */
export function nextSpaceCallsRefetch(data: SpaceCallsResponse | undefined, now: number): number | false {
  // Nothing read yet, or the first read failed: keep trying. A failed later read keeps its data.
  if (!data) return SIGNED_OUT_SPACE_CALLS_POLL_MS;
  if (!data.supported) return false;
  let next = now + SIGNED_OUT_SPACE_CALLS_POLL_MS;
  for (const call of data.calls) {
    const status = call.status ?? 'live';
    const at =
      status === 'scheduled'
        ? Date.parse(call.opens_at ?? '')
        : status === 'live' && call.ends_at
          ? Date.parse(call.starts_at) + CALL_HOLD_OPEN_MS
          : NaN;
    if (status === 'scheduled' && at <= now) return OVERDUE_REFETCH_MS;
    if (at > now) next = Math.min(next, at + TRANSITION_SLACK_MS);
  }
  return next - now;
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
 * `debate.space_calls_changed` on the space scope; signed out, polled while visible, sooner at a
 * transition, and on return to the tab. `live: false` reads it once.
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
