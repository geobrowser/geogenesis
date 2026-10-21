'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  type CalendarConnectSource,
  calendarConnectRequestFailed,
  calendarConnectStarted,
  calendarDisconnected,
  calendarRefreshed,
} from '~/core/availability/calendar-analytics';

import {
  type CalendarConnections,
  GeoChatRequestError,
  connectGoogleCalendar,
  disconnectGoogleCalendar,
  getCalendarBusy,
  getCalendarConnections,
  refreshGoogleCalendar,
} from './api';
import { debateQueryKeys, debateQueryNetworkOptions, useGeoChatAuth } from './hooks';

/** geo-chat answers this on every calendar route while Google Calendar is not configured. */
export const CALENDAR_DISABLED_CODE = 'calendar_disabled';

export function isCalendarDisabled(error: unknown) {
  return error instanceof GeoChatRequestError && error.status === 404 && error.code === CALENDAR_DISABLED_CODE;
}

/** The viewer's connected calendars. `enabled` is the `googleCalendar` flag and the editor being open. */
export function useCalendarConnections(enabled: boolean) {
  const { accountKey, getPrivyIdentityToken } = useGeoChatAuth();

  const query = useQuery({
    ...debateQueryNetworkOptions,
    queryKey: debateQueryKeys.calendarConnections(accountKey),
    queryFn: () => getCalendarConnections(getPrivyIdentityToken, accountKey),
    enabled: enabled && accountKey !== null,
  });

  return {
    ...query,
    google: query.data?.google,
    /** geo-chat has the feature switched off, so there is nothing to offer. */
    disabled: isCalendarDisabled(query.error),
  };
}

/**
 * Busy time from the viewer's own calendar, for shading their grid. Never asked for anyone else.
 * `range` is null while there is nothing to ask for.
 */
export function useCalendarBusy(range: { from: string; to: string } | null) {
  const { accountKey, getPrivyIdentityToken } = useGeoChatAuth();

  const query = useQuery({
    ...debateQueryNetworkOptions,
    queryKey: debateQueryKeys.calendarBusy(accountKey, range?.from ?? '', range?.to ?? ''),
    queryFn: ({ signal }) =>
      getCalendarBusy(range as { from: string; to: string }, getPrivyIdentityToken, accountKey, signal),
    enabled: range !== null && accountKey !== null,
  });

  return { ...query, intervals: query.data?.intervals };
}

/** Everything a calendar change touches: the connection, the shading, and every read that subtracts busy time. */
export function useInvalidateCalendarReads() {
  const queryClient = useQueryClient();
  const { accountKey } = useGeoChatAuth();

  return () => {
    void queryClient.invalidateQueries({ queryKey: debateQueryKeys.calendarConnections(accountKey) });
    void queryClient.invalidateQueries({ queryKey: debateQueryKeys.calendarBusyRoot(accountKey) });
    void queryClient.invalidateQueries({ queryKey: debateQueryKeys.schedulablePeopleRoot(accountKey) });
    void queryClient.invalidateQueries({ queryKey: debateQueryKeys.peerScheduleRoot(accountKey) });
  };
}

/** Resolves with Google's consent URL; the caller sends the browser there. */
export function useConnectGoogleCalendar() {
  const { accountKey, getPrivyIdentityToken } = useGeoChatAuth();

  return useMutation<{ authorization_url: string }, Error, { returnTo: string; source: CalendarConnectSource }>({
    mutationFn: ({ returnTo }) => connectGoogleCalendar(returnTo, getPrivyIdentityToken, accountKey),
    onMutate: ({ source }) => calendarConnectStarted('google', source),
    onError: error => calendarConnectRequestFailed('google', error),
  });
}

/** Settled rather than success: a refusal (404, 429) also means the state on screen may be stale. */
export function useRefreshGoogleCalendar() {
  const { accountKey, getPrivyIdentityToken } = useGeoChatAuth();
  const invalidate = useInvalidateCalendarReads();

  return useMutation<CalendarConnections, Error, void>({
    mutationFn: () => refreshGoogleCalendar(getPrivyIdentityToken, accountKey),
    onSuccess: () => calendarRefreshed('google'),
    onSettled: invalidate,
  });
}

export function useDisconnectGoogleCalendar() {
  const { accountKey, getPrivyIdentityToken } = useGeoChatAuth();
  const invalidate = useInvalidateCalendarReads();

  return useMutation<void, Error, void>({
    mutationFn: () => disconnectGoogleCalendar(getPrivyIdentityToken, accountKey),
    onSuccess: () => calendarDisconnected('google'),
    onSettled: invalidate,
  });
}
