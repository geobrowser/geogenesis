import { type CalendarConnectionError, GeoChatRequestError } from '~/core/debates/api';

/** Why the last sync failed, from `GET /me/calendar`'s `last_error`. */
export function connectionErrorCopy(code: CalendarConnectionError | null) {
  switch (code) {
    case 'invalid_grant':
      return 'Geo no longer has access to your Google Calendar. Reconnect to keep blocking busy times.';
    case 'scope_missing':
      return 'Geo can’t see when you’re busy. Reconnect and allow access to your free/busy times.';
    case 'google_unavailable':
      return 'Google Calendar didn’t respond. We’ll keep trying.';
    case 'rate_limited':
      return 'Google Calendar asked us to slow down. We’ll keep trying.';
    default:
      return 'We couldn’t sync your Google Calendar. We’ll keep trying.';
  }
}

/** A refused connect, refresh or disconnect. */
export function requestErrorCopy(error: unknown) {
  const code = error instanceof GeoChatRequestError ? error.code : null;
  if (code === 'rate_limited') return 'You just refreshed. Try again in a minute.';
  return 'Something went wrong. Try again.';
}

/** The toast for `?calendar=connected` or `?calendar=error&reason=…` on the way back from Google. */
export function calendarReturnCopy(outcome: 'connected' | 'error', reason: string | null) {
  if (outcome === 'connected') return 'Google Calendar connected. Busy times are left out of your availability.';
  switch (reason) {
    case 'denied':
      return 'Google Calendar wasn’t connected.';
    case 'scope_missing':
      return 'Google Calendar wasn’t connected. Allow access to your free/busy times to connect it.';
    case 'state_invalid':
      return 'That Google Calendar sign-in expired. Try connecting again.';
    default:
      return 'We couldn’t connect Google Calendar. Try again.';
  }
}

/** "Synced 4 min ago". Coarse, since syncs run every 15 minutes. */
export function syncedAgo(lastSuccessAt: string | null, now = Date.now()) {
  if (!lastSuccessAt) return 'Not synced yet';
  const at = Date.parse(lastSuccessAt);
  if (Number.isNaN(at)) return 'Not synced yet';
  const minutes = Math.max(0, Math.floor((now - at) / 60_000));
  if (minutes < 1) return 'Synced just now';
  if (minutes < 60) return `Synced ${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Synced ${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `Synced ${days} day${days === 1 ? '' : 's'} ago`;
}
