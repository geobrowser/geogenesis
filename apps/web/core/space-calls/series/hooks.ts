'use client';

import { type QueryClient, useMutation, useQueryClient } from '@tanstack/react-query';

import { type DebateCallAgenda, type DebateLobbyView, dashlessId } from '~/core/debates/api';
import { debateQueryKeys, useGeoChatAuth } from '~/core/debates/hooks';
import { sameId } from '~/core/debates/rooms/room-presence';

import { type SpaceCallsResponse, saveCallAgenda, setCallReminder, setCallSeriesReminder } from '../api';
import { agendaConflictCurrent } from './call-errors';

/** Every viewer's copy of a space's call list, signed in or out. */
const spaceCallsListKey = (spaceId: string) => ['debates', 'space-calls', dashlessId(spaceId)] as const;

/** `ids` with `id` in or out, by id however spelled. */
export function withId(ids: string[], id: string, present: boolean) {
  const rest = ids.filter(other => !sameId(other, id));
  return present ? [...rest, dashlessId(id)] : rest;
}

/** The list's own viewer reminders, after one changed here; reminders are never broadcast. */
export function withListReminder(
  list: SpaceCallsResponse,
  change: { callId: string; reminded: boolean } | { seriesId: string; reminded: boolean }
): SpaceCallsResponse {
  if (!list.viewer) return list;
  const viewer =
    'callId' in change
      ? { ...list.viewer, reminded_call_ids: withId(list.viewer.reminded_call_ids, change.callId, change.reminded) }
      : {
          ...list.viewer,
          reminded_series_ids: withId(list.viewer.reminded_series_ids, change.seriesId, change.reminded),
        };
  return { ...list, viewer };
}

/** A call's view with its series reminder set or cleared, or the same view for another series. */
export function withSeriesReminded(view: DebateLobbyView, seriesId: string, reminded: boolean): DebateLobbyView {
  const call = view.call;
  if (!call?.viewer || !call.series || !sameId(call.series.series_id, seriesId)) return view;
  return { ...view, call: { ...call, viewer: { ...call.viewer, series_reminded: reminded } } };
}

/** Stores a call's fresh view, as `GET /calls/{id}` would. */
function storeCallView(queryClient: QueryClient, accountKey: string | null, view: DebateLobbyView) {
  queryClient.setQueryData(debateQueryKeys.lobby(accountKey, view.lobby_id), view);
}

/** Remind me about one call (GEO-3420). Updates the call's page and its space's list. */
export function useCallReminder(spaceId: string) {
  const { accountKey, getPrivyIdentityToken } = useGeoChatAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['debates', 'call-reminder'],
    mutationFn: ({ callId, remind }: { callId: string; remind: boolean }) =>
      setCallReminder(callId, remind, getPrivyIdentityToken, accountKey),
    onSuccess: (view, { callId }) => {
      storeCallView(queryClient, accountKey, view);
      queryClient.setQueriesData<SpaceCallsResponse>({ queryKey: spaceCallsListKey(spaceId) }, list =>
        list ? withListReminder(list, { callId, reminded: view.viewer.reminded }) : list
      );
    },
  });
}

/** Remind me about every call in a series (GEO-3420). Updates the list and any cached call of it. */
export function useCallSeriesReminder(spaceId: string) {
  const { accountKey, getPrivyIdentityToken } = useGeoChatAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['debates', 'call-series-reminder'],
    mutationFn: ({ seriesId, remind }: { seriesId: string; remind: boolean }) =>
      setCallSeriesReminder(spaceId, seriesId, remind, getPrivyIdentityToken, accountKey),
    onSuccess: ({ series_id, reminded }) => {
      queryClient.setQueriesData<SpaceCallsResponse>({ queryKey: spaceCallsListKey(spaceId) }, list =>
        list ? withListReminder(list, { seriesId: series_id, reminded }) : list
      );
      queryClient.setQueriesData<DebateLobbyView>({ queryKey: ['debates', 'account', accountKey, 'lobby'] }, view =>
        view ? withSeriesReminded(view, series_id, reminded) : view
      );
    },
  });
}

/** A call's view with geo-chat's current agenda, as a conflict reported it. */
export function withAgenda(view: DebateLobbyView, agenda: DebateCallAgenda | null): DebateLobbyView {
  return view.call ? { ...view, call: { ...view.call, agenda } } : view;
}

/** A host's agenda write (GEO-3420); the response is the call's view. A conflict stores the agenda it beat. */
export function useSaveCallAgenda(callId: string) {
  const { accountKey, getPrivyIdentityToken } = useGeoChatAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { body: string; base_updated_at: string | null }) =>
      saveCallAgenda(callId, body, getPrivyIdentityToken, accountKey),
    onSuccess: view => storeCallView(queryClient, accountKey, view),
    onError: error => {
      const current = agendaConflictCurrent(error);
      if (current === undefined) return;
      queryClient.setQueryData<DebateLobbyView>(debateQueryKeys.lobby(accountKey, callId), view =>
        view ? withAgenda(view, current) : view
      );
    },
  });
}
