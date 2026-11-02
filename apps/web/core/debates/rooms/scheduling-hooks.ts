'use client';

import { type QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

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
  ADMIN_SCHEDULED_DEBATES_LIMIT,
  GeoChatRequestError,
  type RunningLateMinutes,
  type ScheduledDebateRequest,
  type ScheduledDebateResponseResult,
  cancelScheduledDebate,
  createScheduledDebate,
  listAdminScheduledDebates,
  listScheduledDebates,
  noTimeWorks,
  nudgeDebateRoom,
  reportRunningLate,
  rescheduleScheduledDebate,
  respondToScheduledDebate,
} from '../api';
import { useDebateVisibility } from '../debate-attention';
import { debateQueryKeys, debateQueryNetworkOptions, invalidateAvailabilityReads, useGeoChatAuth } from '../hooks';

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

/**
 * Every scheduled debate from `from` onward, for the admin calendar (GEO-2943).
 *
 * Doubles as the admin check: a viewer off geo-chat's allowlist is refused (403, or 503 where no
 * admins are configured), and `isAdmin` stays false, so the view never shows. The server is the
 * only authority on who is an admin; nothing here can grant it.
 */
export function useAdminScheduledDebates(enabled: boolean, from: Date) {
  const { accountKey, authenticated, getPrivyIdentityToken } = useGeoChatAuth();
  const present = useDebateVisibility();
  const fromIso = from.toISOString();

  const query = useQuery({
    ...debateQueryNetworkOptions,
    queryKey: debateQueryKeys.adminScheduledDebates(accountKey, fromIso),
    queryFn: ({ signal }) =>
      listAdminScheduledDebates(
        { from: fromIso, limit: ADMIN_SCHEDULED_DEBATES_LIMIT },
        getPrivyIdentityToken,
        accountKey,
        signal
      ),
    enabled: enabled && authenticated,
    // A refusal is the answer for everyone who is not an admin: never retried or polled, or every
    // visitor would ask again forever. Anything else (a blip, a 500, a session that expired) is not
    // an answer: it is retried, and polling carries on past it, so an admin is neither dropped to
    // the Availability view by one bad request nor left looking at a list that stopped updating.
    retry: (failureCount, error) => !isAdminRefusal(error) && failureCount < 2,
    refetchInterval: query => (present && !isAdminRefusal(query.state.error) ? SCHEDULED_POLL_MS : false),
    refetchOnWindowFocus: query => !isAdminRefusal(query.state.error),
  });

  return {
    ...query,
    // A refusal now outranks a list from before it: someone taken off the allowlist mid-visit stops
    // seeing other people's matches, though React Query keeps the last answer it had.
    isAdmin: query.data !== undefined && !isAdminRefusal(query.error),
    /** Still finding out: the view switch waits rather than flashing in and out. */
    isAdminPending: query.isPending && authenticated && enabled,
    truncated: (query.data?.matches.length ?? 0) >= ADMIN_SCHEDULED_DEBATES_LIMIT,
  };
}

/**
 * geo-chat's answer that the viewer is not an admin: off the allowlist (403), or no admins on this
 * deployment (503 `scheduling_admin_not_configured`). Deliberately not a 401: that is a session
 * that expired or is still being registered, which says nothing about the allowlist and clears up.
 */
function isAdminRefusal(error: unknown) {
  return (
    error instanceof GeoChatRequestError && (error.status === 403 || error.code === 'scheduling_admin_not_configured')
  );
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
      // A pending invite holds its time for both people (GEO-3532), so it leaves every availability read.
      invalidateAvailabilityReads(queryClient, accountKey);
    },
    onError: (error, { analytics }, isCurrent) => {
      if (isCurrent?.()) debateScheduledRequestFailed({ mode: 'request', error, analytics });
    },
  });
  // The canonical action (GEO-3073), beside the instant challenge's `start_debate`. A geo-chat user
  // is all a booking knows about the other side, which also keeps these apart from challenges.
  return useObservedMutation(
    mutation,
    'start_debate',
    ({ opponentUserId }) => getContext({ target_type: 'debate_user', target_id: opponentUserId }),
    undefined,
    // GEO-3495: the scheduled request, which the warehouse joins to its room and so to the debate.
    request => ({ request_id: request.request_id })
  );
}

/**
 * What a move, a cancel or "none of these work" leaves stale: the requests, the upcoming rooms (an
 * agreed debate's room closes), and every availability read, since the time is free again for both.
 */
function invalidateFreedTime(queryClient: QueryClient, accountKey: string | null) {
  void queryClient.invalidateQueries({ queryKey: debateQueryKeys.scheduledDebates(accountKey) });
  void queryClient.invalidateQueries({ queryKey: debateQueryKeys.upcomingRooms(accountKey) });
  invalidateAvailabilityReads(queryClient, accountKey);
}

/** Moves an existing request to a new time: "Choose different time" in the scheduling emails. */
export function useRescheduleScheduledDebate() {
  const queryClient = useQueryClient();
  const { accountKey, getPrivyIdentityToken } = useGeoChatAuth();

  return useMutation<
    ScheduledDebateRequest,
    Error,
    {
      requestId: string;
      startsAt: Date;
      minutes: number;
      /** Goes to the other debater with the new time: Can't make it's note (GEO-3427). */
      note?: string;
      analytics?: ScheduledRequestAnalytics;
    },
    AnalyticsRevision
  >({
    mutationFn: ({ requestId, startsAt, minutes, note }) =>
      rescheduleScheduledDebate(
        requestId,
        { ...slotPayload(startsAt, minutes), ...(note ? { note } : {}) },
        getPrivyIdentityToken,
        accountKey
      ),
    onMutate: snapshotAnalyticsRevision,
    onSuccess: (request, { startsAt, analytics }, isCurrent) => {
      if (isCurrent()) {
        debateScheduledRequestSent({ mode: 'reschedule', requestId: request.request_id, startsAt, analytics });
      }
    },
    onError: (error, { analytics }, isCurrent) => {
      if (isCurrent?.()) debateScheduledRequestFailed({ mode: 'reschedule', error, analytics });
    },
    onSettled: () => {
      // Settled, as cancel is: a refusal means the list the viewer acted on is stale. Moving an
      // accepted debate also closes its room and frees its slot for both people, so the upcoming
      // rooms and the availability reads go too, not only the requests.
      invalidateFreedTime(queryClient, accountKey);
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
    { requestId: string; accepted: boolean; surface?: 'lobby' },
    AnalyticsRevision
  >({
    mutationFn: ({ requestId, accepted }) =>
      respondToScheduledDebate(requestId, accepted, getPrivyIdentityToken, accountKey),
    onMutate: snapshotAnalyticsRevision,
    onSuccess: (result, { requestId, accepted, surface }, isCurrent) => {
      if (isCurrent()) debateScheduledRequestAnswered({ requestId, accepted, outcome: result.outcome, surface });
      void queryClient.invalidateQueries({ queryKey: debateQueryKeys.scheduledDebates(accountKey) });
      // An acceptance books the room, which the join prompt reads from a different key.
      void queryClient.invalidateQueries({ queryKey: debateQueryKeys.upcomingRooms(accountKey) });
      // A decline frees the invite's time, and an acceptance frees the times of the invites it supersedes.
      invalidateAvailabilityReads(queryClient, accountKey);
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

/**
 * Calls a scheduled debate off (GEO-3093): withdrawing a request you proposed, or cancelling one both
 * of you agreed to. geo-chat frees the slot for both people, so the viewer's availability reads go
 * too; the other debater's client hears it through `debate.requests_changed`.
 */
export function useCancelScheduledDebate() {
  const queryClient = useQueryClient();
  const { accountKey, getPrivyIdentityToken } = useGeoChatAuth();

  return useMutation<ScheduledDebateRequest, Error, { requestId: string; note?: string }>({
    mutationFn: ({ requestId, note }) =>
      cancelScheduledDebate(requestId, getPrivyIdentityToken, accountKey, note ? { note } : undefined),
    onSettled: () => {
      // Settled rather than succeeded: a refusal (someone joined, or it was already resolved) means
      // the list the viewer pressed on is stale, and the refetch is what corrects it.
      invalidateFreedTime(queryClient, accountKey);
    },
  });
}

/**
 * Can't make it (GEO-3427): the same cancel, observed as its own action so the outcome measurement
 * (GEO-3432) can tell a debater withdrawing from the Requests tab's quiet Cancel.
 */
export function useCantMakeIt() {
  const getContext = useActionContext('scheduled_debate_notice', 'entity', '');
  return useObservedMutation(useCancelScheduledDebate(), 'cant_make_it', ({ requestId }) =>
    getContext({ target_type: 'scheduled_debate_request', target_id: requestId })
  );
}

/**
 * "None of these work" on the reschedule screen (GEO-3429): calls the debate off and emails the other
 * debater the viewer's free times. Observed as its own action, beside Can't make it, so the outcome
 * measurement (GEO-3432) can count it; geo-chat also tags its cancelled or declined event.
 */
export function useNoTimeWorks() {
  // The week's component, as moving a request from it is: this is pressed there, not on the notice.
  const getContext = useActionContext('debate_matchmaking', 'entity', '');
  const queryClient = useQueryClient();
  const { accountKey, getPrivyIdentityToken } = useGeoChatAuth();
  const mutation = useMutation<ScheduledDebateRequest, Error, { requestId: string }>({
    mutationFn: ({ requestId }) => noTimeWorks(requestId, getPrivyIdentityToken, accountKey),
    onSettled: () => {
      // As cancel: the time is free again for both, and a refusal means the list is stale.
      invalidateFreedTime(queryClient, accountKey);
    },
  });
  return useObservedMutation(mutation, 'no_time_works', ({ requestId }) =>
    getContext({ target_type: 'scheduled_debate_request', target_id: requestId })
  );
}

/**
 * Running late (GEO-3427). The notice lives on the room view, which the other debater's page polls;
 * the requests list does not change. Only the viewer's own room reads are refreshed, for a second tab
 * of theirs with the room open.
 */
export function useReportRunningLate() {
  const getContext = useActionContext('scheduled_debate_notice', 'entity', '');
  const queryClient = useQueryClient();
  const { accountKey, getPrivyIdentityToken } = useGeoChatAuth();

  const mutation = useMutation({
    mutationFn: ({ requestId, minutes, note }: { requestId: string; minutes: RunningLateMinutes; note?: string }) =>
      reportRunningLate(requestId, { minutes, ...(note ? { note } : {}) }, getPrivyIdentityToken, accountKey),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: debateQueryKeys.roomRoot(accountKey) });
    },
  });
  return useObservedMutation(mutation, 'running_late', ({ requestId }) =>
    getContext({ target_type: 'scheduled_debate_request', target_id: requestId })
  );
}

/**
 * Nudge the other debater from the room (GEO-3428). Refetches the room either way, so the button
 * and the timeline read what geo-chat recorded rather than what was pressed.
 */
export function useNudgeDebateRoom(roomId: string) {
  const getContext = useActionContext('debate_room', 'entity', '');
  const queryClient = useQueryClient();
  const { accountKey, getPrivyIdentityToken } = useGeoChatAuth();

  const mutation = useMutation({
    mutationFn: () => nudgeDebateRoom(roomId, getPrivyIdentityToken, accountKey),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: debateQueryKeys.roomRoot(accountKey) });
    },
  });
  return useObservedMutation(mutation, 'nudge', () => getContext({ target_type: 'debate_room', target_id: roomId }));
}
