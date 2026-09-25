'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  type ScheduledDebateRequest,
  type ScheduledDebateResponseResult,
  createScheduledDebate,
  listScheduledDebates,
  respondToScheduledDebate,
} from '../api';
import { useDebateVisibility } from '../debate-attention';
import { debateQueryKeys, debateQueryNetworkOptions, useGeoChatAuth } from '../hooks';

/** Backstop for an event refetch that failed past the gateway's retries; the socket stays ready. */
const SCHEDULED_POLL_MS = 60_000;

/**
 * Proposing and answering a scheduled debate (GEO-2934). The second answer books the room, so this
 * is the only way to reach one without writing rows by hand.
 */
export function useScheduledDebates(enabled = true) {
  const { accountKey, authenticated, getPrivyIdentityToken } = useGeoChatAuth();
  const present = useDebateVisibility();

  return useQuery({
    ...debateQueryNetworkOptions,
    queryKey: debateQueryKeys.scheduledDebates(accountKey),
    queryFn: ({ signal }) => listScheduledDebates(getPrivyIdentityToken, accountKey, signal),
    enabled: enabled && authenticated,
    refetchInterval: present ? SCHEDULED_POLL_MS : false,
    // Coming back to the tab is exactly when an answer is most likely to have landed already.
    refetchOnWindowFocus: true,
  });
}

export function useCreateScheduledDebate() {
  const queryClient = useQueryClient();
  const { accountKey, getPrivyIdentityToken } = useGeoChatAuth();

  return useMutation<ScheduledDebateRequest, Error, { opponentUserId: string; startsAt: Date; minutes: number }>({
    mutationFn: ({ opponentUserId, startsAt, minutes }) =>
      createScheduledDebate(
        {
          opponent_user_id: opponentUserId,
          scheduled_start_at: startsAt.toISOString(),
          scheduled_end_at: new Date(startsAt.getTime() + minutes * 60_000).toISOString(),
        },
        getPrivyIdentityToken,
        accountKey
      ),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: debateQueryKeys.scheduledDebates(accountKey) }),
  });
}

export function useRespondToScheduledDebate() {
  const queryClient = useQueryClient();
  const { accountKey, getPrivyIdentityToken } = useGeoChatAuth();

  return useMutation<ScheduledDebateResponseResult, Error, { requestId: string; accepted: boolean }>({
    mutationFn: ({ requestId, accepted }) =>
      respondToScheduledDebate(requestId, accepted, getPrivyIdentityToken, accountKey),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: debateQueryKeys.scheduledDebates(accountKey) });
      // An acceptance books the room, which the join prompt reads from a different key.
      void queryClient.invalidateQueries({ queryKey: debateQueryKeys.upcomingRooms(accountKey) });
    },
  });
}
