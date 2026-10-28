import { capture } from '~/core/analytics';
import { type CalendarConnection, type CalendarProvider, GeoChatRequestError } from '~/core/debates/api';

/**
 * Analytics for calendar connections (the `googleCalendar` and `microsoftCalendar` flags). Outcome
 * events, registered in `geobrowser/analytics`; no account email or provider message leaves here.
 */

export type { CalendarProvider };

/** Which button sent the viewer to the provider. */
export type CalendarConnectSource = 'connect' | 'reconnect';

export function calendarConnectStarted(provider: CalendarProvider, source: CalendarConnectSource) {
  capture('calendar_connect_started', { provider, source });
}

export function calendarConnected(provider: CalendarProvider) {
  capture('calendar_connected', { provider });
}

/** geo-chat refused to start the connect: its error code, or `unknown`. */
export function calendarConnectRequestFailed(provider: CalendarProvider, error: unknown) {
  const reason = error instanceof GeoChatRequestError && error.code ? error.code : 'unknown';
  capture('calendar_connect_failed', { provider, reason, stage: 'request' });
}

/** The provider's redirect came back with `?calendar=error&reason=…`. */
export function calendarConnectCallbackFailed(provider: CalendarProvider, reason: string | null) {
  capture('calendar_connect_failed', { provider, reason: reason ?? 'unknown', stage: 'callback' });
}

/** A refresh geo-chat answered. Its sync can still have failed, so the outcome is the connection's status. */
export function calendarRefreshed(provider: CalendarProvider, connection: CalendarConnection | null) {
  capture('calendar_refreshed', { provider, outcome: connection?.status ?? 'error' });
}

export function calendarDisconnected(provider: CalendarProvider) {
  capture('calendar_disconnected', { provider });
}
