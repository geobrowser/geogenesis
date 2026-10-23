import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  NotificationsRequestError,
  geoNotificationsApiUrl,
  registerForNotifications,
  updateNotificationPreferences,
} from './api';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const respond = (status: number, body: unknown) =>
  vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify(body), { status }));

describe('geo-notifications client', () => {
  it('is off unless its URL is configured', () => {
    vi.stubEnv('NEXT_PUBLIC_GEO_NOTIFICATIONS_API_URL', '');
    expect(geoNotificationsApiUrl()).toBeNull();
    vi.stubEnv('NEXT_PUBLIC_GEO_NOTIFICATIONS_API_URL', 'https://notifications.example/');
    expect(geoNotificationsApiUrl()).toBe('https://notifications.example');
  });

  // The id gaia addresses notifications to is the personal space, as a dashed UUID. Registering any
  // other id sends every notification to nobody, silently.
  it('registers the personal space, dashed, with the Privy token', async () => {
    const fetch = respond(200, { id: 'u1', user_space_id: 'x', email: 'a@b.com' });
    vi.stubGlobal('fetch', fetch);

    await registerForNotifications('https://n.example', 'tok', 'f3dab79cb5a3d9d1759656dd5361d1c6');

    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe('https://n.example/users');
    expect(init?.method).toBe('POST');
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer tok');
    expect(JSON.parse(String(init?.body))).toEqual({ user_space_id: 'f3dab79c-b5a3-d9d1-7596-56dd5361d1c6' });
  });

  it('sends only the field being changed', async () => {
    const fetch = respond(200, { in_app_enabled: true, email_enabled: false });
    vi.stubGlobal('fetch', fetch);

    await updateNotificationPreferences('https://n.example', 'tok', { email_enabled: false });

    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe('https://n.example/preferences');
    expect(init?.method).toBe('PUT');
    expect(JSON.parse(String(init?.body))).toEqual({ email_enabled: false });
  });

  it("carries the service's status and message on failure", async () => {
    vi.stubGlobal('fetch', respond(403, { error: 'user not registered' }));

    const failure = await updateNotificationPreferences('https://n.example', 'tok', { email_enabled: true }).catch(
      (error: unknown) => error
    );

    expect(failure).toBeInstanceOf(NotificationsRequestError);
    expect((failure as NotificationsRequestError).status).toBe(403);
    expect((failure as Error).message).toBe('user not registered');
  });
});
