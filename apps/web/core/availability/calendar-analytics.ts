import { capture } from '~/core/analytics';
import { GeoChatRequestError } from '~/core/debates/api';

/**
 * Analytics for calendar connections (the `googleCalendar` flag). Outcome events, registered in
 * `geobrowser/analytics`; no account email or provider message leaves here.
 */

export type CalendarProvider = 'google';

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

export function calendarRefreshed(provider: CalendarProvider) {
  capture('calendar_refreshed', { provider });
}

export function calendarDisconnected(provider: CalendarProvider) {
  capture('calendar_disconnected', { provider });
}
