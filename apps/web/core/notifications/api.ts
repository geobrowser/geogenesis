/**
 * geo-notifications, called from the browser (GEO-3029).
 *
 * Geo registers the signed-in person once per login (`POST /users`), which is what lets notifications
 * addressed to them find a recipient, and reads and writes their email preference for the switch in
 * the account menu (`GET` / `PUT /preferences`). Every call carries the Privy access token; the
 * service derives the Privy user and the email address from it and never trusts either from here.
 *
 * Off when `NEXT_PUBLIC_GEO_NOTIFICATIONS_API_URL` is unset: nothing registers and the switch does
 * not render.
 */
import { ID } from '~/core/id';

import type { EmailGroup, EmailGroupSettings } from './email-groups';

export function geoNotificationsApiUrl(): string | null {
  const configured = process.env.NEXT_PUBLIC_GEO_NOTIFICATIONS_API_URL?.trim();
  return configured ? configured.replace(/\/+$/, '') : null;
}

export class NotificationsRequestError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = 'NotificationsRequestError';
  }
}

export type NotificationRegistration = {
  id: string;
  user_space_id: string;
  /** From the Privy account, server-side. Null when the account has no email: nothing can be sent. */
  email: string | null;
};

export type NotificationPreferences = {
  in_app_enabled: boolean;
  /** The all-email switch. Off overrides every group; the groups keep their own values underneath. */
  email_enabled: boolean;
  /**
   * The six groups (GEO-3372, community calls GEO-3420). Absent from a service that predates them: settings then shows only the
   * all-email switch.
   */
  email_groups?: EmailGroupSettings;
  /** Where email goes, masked by the service (`jo•••@gmail.com`); null with no address on file. */
  email?: string | null;
};

/** A change to the preferences: the all-email switch, one or more groups, or both. */
export type NotificationPreferencesPatch = {
  in_app_enabled?: boolean;
  email_enabled?: boolean;
  email_groups?: Partial<EmailGroupSettings>;
};

async function notificationsRequest<T>(
  baseUrl: string,
  path: string,
  accessToken: string | null,
  init: { method?: 'GET' | 'POST' | 'PUT'; body?: unknown; keepalive?: boolean; signal?: AbortSignal } = {}
): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      Accept: 'application/json',
      ...(accessToken === null ? {} : { Authorization: `Bearer ${accessToken}` }),
      ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    keepalive: init.keepalive,
    signal: init.signal,
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => null);
    const message = (detail as { error?: string } | null)?.error ?? `geo-notifications ${response.status}`;
    throw new NotificationsRequestError(message, response.status);
  }
  return (await response.json()) as T;
}

/**
 * Idempotent upsert, safe on every login. The id is the person's personal space, the same id gaia
 * addresses notifications to (checked against live rows on 2026-09-29: every recipient is a PERSONAL
 * space). The service wants it as a dashed UUID; Geo holds it as 32 hex characters.
 */
export function registerForNotifications(baseUrl: string, accessToken: string, personalSpaceId: string) {
  return notificationsRequest<NotificationRegistration>(baseUrl, '/users', accessToken, {
    method: 'POST',
    body: { user_space_id: ID.hexToUuid(personalSpaceId) },
  });
}

export function getNotificationPreferences(baseUrl: string, accessToken: string) {
  return notificationsRequest<NotificationPreferences>(baseUrl, '/preferences', accessToken);
}

export function updateNotificationPreferences(
  baseUrl: string,
  accessToken: string,
  patch: NotificationPreferencesPatch
) {
  return notificationsRequest<NotificationPreferences>(baseUrl, '/preferences', accessToken, {
    method: 'PUT',
    body: patch,
  });
}

/**
 * The seen ping (GEO-3371): this visit, and the browser's zone, which the retention emails are
 * scheduled in. The service accepts a token that expired within the past week, so a visit counts
 * even when Privy is too slow to hand out a fresh one. `keepalive` so it survives the page being
 * hidden or closed right after it fires.
 */
export function sendSeenPing(baseUrl: string, accessToken: string, timeZone: string, signal?: AbortSignal) {
  return notificationsRequest<{ local_date: string; new_day: boolean }>(baseUrl, '/me/seen', accessToken, {
    method: 'POST',
    body: { time_zone: timeZone },
    keepalive: true,
    signal,
  });
}

/**
 * The unsubscribe link in an email (GEO-3372 / GEO-3392). geo-notifications signs its `token` for one
 * person and one group, so none of these calls needs a sign-in; `kind` and `send` say which email it
 * came from and are passed back as they arrived. Reading it changes nothing (mail scanners open every
 * link): only the `unsubscribe` action does, and `undo` reverses it within a day.
 */
export type UnsubscribeLinkParams = { token: string; kind: string | null; send: string | null };

export type UnsubscribeState = {
  /**
   * `already_on`: Undo changed nothing because the group was on anyway (pressed twice, or switched back
   * on in settings). `undo_expired`: Undo after a day, or after the preferences changed since.
   */
  state: 'ask' | 'done' | 'already_off' | 'undone' | 'already_on' | 'undo_expired';
  group: EmailGroup;
  group_name: string;
  /** Masked, as on the settings dialog; null for someone with no address on file. */
  email: string | null;
  subscribed: boolean;
  all_email_enabled: boolean;
};

function unsubscribePath({ token, kind, send }: UnsubscribeLinkParams) {
  const params = new URLSearchParams({ token });
  if (kind) params.set('kind', kind);
  if (send) params.set('send', send);
  return `/unsubscribe?${params.toString()}`;
}

export function getUnsubscribeState(baseUrl: string, link: UnsubscribeLinkParams) {
  return notificationsRequest<UnsubscribeState>(baseUrl, unsubscribePath(link), null);
}

export function changeSubscription(baseUrl: string, link: UnsubscribeLinkParams, action: 'unsubscribe' | 'undo') {
  return notificationsRequest<UnsubscribeState>(baseUrl, unsubscribePath(link), null, {
    method: 'POST',
    body: { action },
  });
}

export type EmailClick = {
  /** The send's id from the email's link (`ref_send`). */
  send_id: string;
  /** Which link in the email (`ref_link`): `main`, `profile`, `claim`, … Null when the link didn't say. */
  link: string | null;
  /** Whether this browser held a Privy session to restore when the page loaded (`hasPersistedPrivySession`). */
  signed_in: boolean;
};

/**
 * A counted click on a link in one of our emails (GEO-3370): the page it opened loaded here and is on
 * screen. No token: people often arrive signed out, and the send id is all the service needs.
 * `keepalive` so it survives the visitor leaving straight away.
 */
export function reportEmailClick(baseUrl: string, click: EmailClick) {
  return notificationsRequest<{ outcome: string }>(baseUrl, '/email-clicks', null, {
    method: 'POST',
    body: click,
    keepalive: true,
  });
}
