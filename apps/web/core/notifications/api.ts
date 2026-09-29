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
  email_enabled: boolean;
};

async function notificationsRequest<T>(
  baseUrl: string,
  path: string,
  accessToken: string,
  init: { method?: 'GET' | 'POST' | 'PUT'; body?: unknown } = {}
): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
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
  patch: Partial<NotificationPreferences>
) {
  return notificationsRequest<NotificationPreferences>(baseUrl, '/preferences', accessToken, {
    method: 'PUT',
    body: patch,
  });
}
