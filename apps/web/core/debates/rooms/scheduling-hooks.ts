'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useCallback } from 'react';

import { useActionContext } from '~/core/action-context-provider';
import { snapshotAnalyticsRevision } from '~/core/analytics-operations';
import {
  type ScheduledRequestAnalytics,
  debateScheduledRequestAnswered,
  debateScheduledRequestFailed,
  debateScheduledRequestSent,
} from '~/core/availability/schedule-analytics';
import { useObservedMutation } from '~/core/hooks/use-observed-mutation';

import {
  type ScheduledDebateRequest,
  type ScheduledDebateResponseResult,
  createScheduledDebate,
  listScheduledDebates,
  rescheduleScheduledDebate,
  respondToScheduledDebate,
} from '../api';
import { useDebateVisibility } from '../debate-attention';
import { debateQueryKeys, debateQueryNetworkOptions, useGeoChatAuth } from '../hooks';

/** Backstop for an event refetch that failed past the gateway's retries; the socket stays ready. */
const SCHEDULED_POLL_MS = 60_000;

/** Whether an async result still belongs to the account that started it. */
type AnalyticsRevision = ReturnType<typeof snapshotAnalyticsRevision>;

/** A slot as geo-chat takes it: an instant and a length become a start and an end. */
function slotPayload(startsAt: Date, minutes: number) {
  return {
    scheduled_start_at: startsAt.toISOString(),
    scheduled_end_at: new Date(startsAt.getTime() + minutes * 60_000).toISOString(),
  };
}

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
  const getContext = useActionContext('debate_matchmaking', 'entity', '');
  const queryClient = useQueryClient();
  const { accountKey, getPrivyIdentityToken } = useGeoChatAuth();

  const mutation = useMutation<
    ScheduledDebateRequest,
    Error,
    { opponentUserId: string; startsAt: Date; minutes: number; analytics?: ScheduledRequestAnalytics },
    AnalyticsRevision
  >({
    mutationFn: ({ opponentUserId, startsAt, minutes }) =>
      createScheduledDebate(
        { opponent_user_id: opponentUserId, ...slotPayload(startsAt, minutes) },
        getPrivyIdentityToken,
        accountKey
      ),
    // Analytics here rather than at the call site: a shared link's modal can be closed while the
    // request is in flight, and a caller's own callbacks die with it. Outliving the caller also means
    // outliving the account that sent it, hence the revision taken at the start.
    onMutate: snapshotAnalyticsRevision,
    onSuccess: (request, { startsAt, analytics }, isCurrent) => {
      if (isCurrent()) {
        debateScheduledRequestSent({ mode: 'request', requestId: request.request_id, startsAt, analytics });
      }
      void queryClient.invalidateQueries({ queryKey: debateQueryKeys.scheduledDebates(accountKey) });
    },
    onError: (error, { analytics }, isCurrent) => {
      if (isCurrent?.()) debateScheduledRequestFailed({ mode: 'request', error, analytics });
    },
  });
  // The canonical action (GEO-3073), beside the instant challenge's `start_debate`. A geo-chat user
  // is all a booking knows about the other side, which also keeps these apart from challenges.
  return useObservedMutation(mutation, 'start_debate', ({ opponentUserId }) =>
    getContext({ target_type: 'debate_user', target_id: opponentUserId })
  );
}

/** Moves an existing request to a new time: "Choose different time" in the scheduling emails. */
export function useRescheduleScheduledDebate() {
  const queryClient = useQueryClient();
  const { accountKey, getPrivyIdentityToken } = useGeoChatAuth();

  return useMutation<
    ScheduledDebateRequest,
    Error,
    { requestId: string; startsAt: Date; minutes: number; analytics?: ScheduledRequestAnalytics },
    AnalyticsRevision
  >({
    mutationFn: ({ requestId, startsAt, minutes }) =>
      rescheduleScheduledDebate(requestId, slotPayload(startsAt, minutes), getPrivyIdentityToken, accountKey),
    onMutate: snapshotAnalyticsRevision,
    onSuccess: (request, { startsAt, analytics }, isCurrent) => {
      if (isCurrent()) {
        debateScheduledRequestSent({ mode: 'reschedule', requestId: request.request_id, startsAt, analytics });
      }
      void queryClient.invalidateQueries({ queryKey: debateQueryKeys.scheduledDebates(accountKey) });
    },
    onError: (error, { analytics }, isCurrent) => {
      if (isCurrent?.()) debateScheduledRequestFailed({ mode: 'reschedule', error, analytics });
    },
  });
}

export function useRespondToScheduledDebate() {
  const getContext = useActionContext('debate_matchmaking', 'entity', '');
  const queryClient = useQueryClient();
  const { accountKey, getPrivyIdentityToken } = useGeoChatAuth();

  const mutation = useMutation<
    ScheduledDebateResponseResult,
    Error,
    { requestId: string; accepted: boolean },
    AnalyticsRevision
  >({
    mutationFn: ({ requestId, accepted }) =>
      respondToScheduledDebate(requestId, accepted, getPrivyIdentityToken, accountKey),
    onMutate: snapshotAnalyticsRevision,
    onSuccess: (result, { requestId, accepted }, isCurrent) => {
      if (isCurrent()) debateScheduledRequestAnswered({ requestId, accepted, outcome: result.outcome });
      void queryClient.invalidateQueries({ queryKey: debateQueryKeys.scheduledDebates(accountKey) });
      // An acceptance books the room, which the join prompt reads from a different key.
      void queryClient.invalidateQueries({ queryKey: debateQueryKeys.upcomingRooms(accountKey) });
    },
  });
  const accept = useObservedMutation(
    mutation,
    'join_debate',
    ({ requestId }) => getContext({ target_type: 'scheduled_debate_request', target_id: requestId }),
    // A clash is geo-chat refusing the acceptance: no room was booked, so no one joined anything.
    result => (result.outcome === 'conflict' ? 'conflict' : null)
  );
  // Only an acceptance is a `join_debate`. Declining is not an action in GEO-3073's vocabulary; the
  // instant request cards' decline is not observed either.
  const { mutate: acceptMutate, mutateAsync: acceptMutateAsync } = accept;
  const { mutate: declineMutate, mutateAsync: declineMutateAsync } = mutation;
  const mutate = useCallback<typeof mutation.mutate>(
    (variables, options) => (variables.accepted ? acceptMutate : declineMutate)(variables, options),
    [acceptMutate, declineMutate]
  );
  const mutateAsync = useCallback<typeof mutation.mutateAsync>(
    (variables, options) => (variables.accepted ? acceptMutateAsync : declineMutateAsync)(variables, options),
    [acceptMutateAsync, declineMutateAsync]
  );
  return { ...mutation, mutate, mutateAsync };
}
