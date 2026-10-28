'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useDebateGatewayScope } from '~/core/debates/debate-gateway';
import { debateQueryKeys, debateQueryNetworkOptions, useGeoChatAuth } from '~/core/debates/hooks';

import { type SpaceCallsResponse, listSpaceCalls, startSpaceCall } from './api';
import { spaceCallKeys } from './query-keys';

/** Signed out there is no gateway; the contract asks for 30–60s. */
export const SIGNED_OUT_SPACE_CALLS_POLL_MS = 45_000;

/** Polls signed out, except for a space without calls, which cannot gain one. */
export function signedOutSpaceCallsPoll(data: SpaceCallsResponse | undefined): number | false {
  return data?.supported === false ? false : SIGNED_OUT_SPACE_CALLS_POLL_MS;
}

/** Signed in the gateway keeps the list current; a one-off read (`live: false`) never polls. */
export function spaceCallsPoll(
  { authenticated, live }: { authenticated: boolean; live: boolean },
  data: SpaceCallsResponse | undefined
): number | false {
  return authenticated || !live ? false : signedOutSpaceCallsPoll(data);
}

/**
 * A space's live calls and whether the viewer may start one (GEO-3419). Signed in, kept current by
 * `debate.space_calls_changed` on the space scope; signed out, polled. `live: false` reads it once.
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
    refetchInterval: query => spaceCallsPoll({ authenticated, live }, query.state.data),
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
