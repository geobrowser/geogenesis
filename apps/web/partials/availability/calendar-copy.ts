import { type CalendarConnectionError, type CalendarProvider, GeoChatRequestError } from '~/core/debates/api';

/** The calendar's name in copy. */
export function calendarName(provider: CalendarProvider) {
  return provider === 'microsoft' ? 'Outlook Calendar' : 'Google Calendar';
}

/** Whose page the browser goes to on connect: "Opening Google…". */
export function signInName(provider: CalendarProvider) {
  return provider === 'microsoft' ? 'Microsoft' : 'Google';
}

/** Why the last sync failed, from `GET /me/calendar`'s `last_error`. */
export function connectionErrorCopy(provider: CalendarProvider, code: CalendarConnectionError | null) {
  const name = calendarName(provider);
  switch (code) {
    case 'invalid_grant':
      return `Geo no longer has access to your ${name}. Reconnect to keep blocking busy times.`;
    case 'scope_missing':
      return 'Geo can’t see when you’re busy. Reconnect and allow access to your free/busy times.';
    case 'mailbox_unavailable':
      return 'This account has no Outlook calendar Geo can read. Connect a different Microsoft account.';
    case 'provider_unavailable':
      return `${name} didn’t respond. We’ll keep trying.`;
    case 'rate_limited':
      return `${name} asked us to slow down. We’ll keep trying.`;
    default:
      return `We couldn’t sync your ${name}. We’ll keep trying.`;
  }
}

/** A refused connect, refresh or disconnect. */
export function requestErrorCopy(error: unknown) {
  const code = error instanceof GeoChatRequestError ? error.code : null;
  if (code === 'rate_limited') return 'You just refreshed. Try again in a minute.';
  return 'Something went wrong. Try again.';
}

/** The message for `?calendar=connected` or `?calendar=error&reason=…` on the way back from the provider. */
export function calendarReturnCopy(provider: CalendarProvider, outcome: 'connected' | 'error', reason: string | null) {
  const name = calendarName(provider);
  if (outcome === 'connected') return `${name} connected. Busy times are left out of your availability.`;
  switch (reason) {
    case 'denied':
      return `${name} wasn’t connected.`;
    case 'scope_missing':
      return `${name} wasn’t connected. Allow access to your free/busy times to connect it.`;
    case 'state_invalid':
      return `That ${signInName(provider)} sign-in expired. Try connecting again.`;
    case 'admin_consent_required':
      return 'Your organization’s IT admin must approve Geo before you can connect this calendar. Personal Microsoft accounts work without approval.';
    default:
      return `We couldn’t connect ${name}. Try again.`;
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
