'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import {
  type CalendarConnectSource,
  calendarConnectRequestFailed,
  calendarConnectStarted,
  calendarDisconnected,
  calendarRefreshed,
} from '~/core/availability/calendar-analytics';

import {
  type CalendarConnection,
  type CalendarConnections,
  type CalendarProvider,
  GeoChatRequestError,
  connectCalendar,
  disconnectCalendar,
  getCalendarBusy,
  getCalendarConnections,
  refreshCalendar,
} from './api';
import { debateQueryKeys, debateQueryNetworkOptions, useGeoChatAuth } from './hooks';

/** geo-chat answers this on every calendar route while no calendar provider is configured. */
export const CALENDAR_DISABLED_CODE = 'calendar_disabled';

export function isCalendarDisabled(error: unknown) {
  return error instanceof GeoChatRequestError && error.status === 404 && error.code === CALENDAR_DISABLED_CODE;
}

function configuredProviders({ providers }: CalendarConnections): CalendarProvider[] {
  if (!providers) return ['google'];
  return providers.filter(
    (provider): provider is CalendarProvider => provider === 'google' || provider === 'microsoft'
  );
}

/** How often the connection is read while its first sync is still running. */
export const CALENDAR_SYNCING_POLL_MS = 15_000;

/** Connected, but the first sync has not landed yet; geo-chat's sweeper picks it up within a minute. */
export function isCalendarSyncing(connection: CalendarConnection | null | undefined) {
  return connection?.status === 'ok' && connection.stale && connection.last_success_at === null;
}

function anySyncing(data: CalendarConnections | undefined) {
  return isCalendarSyncing(data?.google) || isCalendarSyncing(data?.microsoft);
}

/** The viewer's connected calendars. `enabled` is a calendar flag and the editor being open. */
export function useCalendarConnections(enabled: boolean) {
  const { accountKey, getPrivyIdentityToken } = useGeoChatAuth();
  const invalidate = useInvalidateCalendarReads();

  const query = useQuery({
    ...debateQueryNetworkOptions,
    queryKey: debateQueryKeys.calendarConnections(accountKey),
    queryFn: () => getCalendarConnections(getPrivyIdentityToken, accountKey),
    enabled: enabled && accountKey !== null,
    refetchInterval: ({ state }) => (anySyncing(state.data) ? CALENDAR_SYNCING_POLL_MS : false),
  });

  // Busy time read during the first sync is empty, so read it again once the sync lands.
  const syncing = anySyncing(query.data);
  const wasSyncing = React.useRef(syncing);
  React.useEffect(() => {
    if (wasSyncing.current && !syncing) invalidate();
    wasSyncing.current = syncing;
  }, [syncing, invalidate]);

  return {
    ...query,
    google: query.data?.google,
    microsoft: query.data ? (query.data.microsoft ?? null) : undefined,
    /** The providers geo-chat can connect; a geo-chat that predates the list only knows Google. */
    providers: query.data ? configuredProviders(query.data) : undefined,
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

/** Resolves with the provider's consent URL; the caller sends the browser there. */
export function useConnectCalendar() {
  const { accountKey, getPrivyIdentityToken } = useGeoChatAuth();

  return useMutation<
    { authorization_url: string },
    Error,
    { provider: CalendarProvider; returnTo: string; source: CalendarConnectSource }
  >({
    mutationFn: ({ provider, returnTo }) => connectCalendar(provider, returnTo, getPrivyIdentityToken, accountKey),
    onMutate: ({ provider, source }) => calendarConnectStarted(provider, source),
    onError: (error, { provider }) => calendarConnectRequestFailed(provider, error),
  });
}

/**
 * The answer is the connection after the sync, failed or not, so it shows at once. Settled rather
 * than success: a refusal (404, 429) also means the state on screen may be stale.
 */
export function useRefreshCalendar(provider: CalendarProvider) {
  const queryClient = useQueryClient();
  const { accountKey, getPrivyIdentityToken } = useGeoChatAuth();
  const invalidate = useInvalidateCalendarReads();

  return useMutation<CalendarConnections, Error, void>({
    mutationFn: () => refreshCalendar(provider, getPrivyIdentityToken, accountKey),
    onSuccess: connections => {
      queryClient.setQueryData(debateQueryKeys.calendarConnections(accountKey), connections);
      calendarRefreshed(provider, connections[provider] ?? null);
    },
    onSettled: invalidate,
  });
}

export function useDisconnectCalendar(provider: CalendarProvider) {
  const { accountKey, getPrivyIdentityToken } = useGeoChatAuth();
  const invalidate = useInvalidateCalendarReads();

  return useMutation<void, Error, void>({
    mutationFn: () => disconnectCalendar(provider, getPrivyIdentityToken, accountKey),
    onSuccess: () => calendarDisconnected(provider),
    onSettled: invalidate,
  });
}
