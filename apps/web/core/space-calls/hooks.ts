'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { dashlessId } from '~/core/debates/api';
import { useDebateGatewayScope } from '~/core/debates/debate-gateway';
import { debateQueryKeys, debateQueryNetworkOptions, useGeoChatAuth } from '~/core/debates/hooks';

import { listSpaceCalls, startSpaceCall } from './api';

/** Under `debates`, so a gateway reconcile refetches it; the event patches every viewer's copy. */
export const spaceCallsQueryKey = (spaceId: string, accountKey: string | null) =>
  ['debates', 'space-calls', dashlessId(spaceId), accountKey] as const;

/** Signed out there is no gateway; the contract asks for 30–60s. */
export const SIGNED_OUT_SPACE_CALLS_POLL_MS = 45_000;

/**
 * A space's live calls and whether the viewer may start one (GEO-3419). Signed in, kept current by
 * `debate.space_calls_changed` on the space scope; signed out, polled.
 */
export function useSpaceCalls(spaceId: string, enabled = true) {
  const { accountKey, authenticated, ready, getPrivyIdentityToken } = useGeoChatAuth();
  const viewerKey = authenticated ? accountKey : null;
  useDebateGatewayScope({ scope: 'space', space_id: spaceId }, enabled && authenticated);

  return useQuery({
    ...debateQueryNetworkOptions,
    queryKey: spaceCallsQueryKey(spaceId, viewerKey),
    queryFn: ({ signal }) => listSpaceCalls(spaceId, getPrivyIdentityToken, viewerKey, signal),
    enabled: enabled && ready && Boolean(spaceId),
    ...(authenticated ? {} : { refetchInterval: SIGNED_OUT_SPACE_CALLS_POLL_MS }),
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
      void queryClient.invalidateQueries({ queryKey: ['debates', 'space-calls', dashlessId(spaceId)] });
    },
  });
}
