import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';

import * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authenticated: true,
  personalSpaceId: 'f3dab79cb5a3d9d1759656dd5361d1c6' as string | null,
  register: vi.fn(),
  get: vi.fn(),
  update: vi.fn(),
  capture: vi.fn(),
}));

vi.mock('~/core/analytics', () => ({ capture: (...args: unknown[]) => mocks.capture(...args) }));

vi.mock('~/core/wallet/auth-hooks', () => ({
  usePrivy: () => ({
    ready: true,
    authenticated: mocks.authenticated,
    user: mocks.authenticated ? { id: 'did:privy:1' } : null,
    getAccessToken: async () => 'tok',
  }),
}));
vi.mock('~/core/hooks/use-personal-space-id', () => ({
  usePersonalSpaceId: () => ({ personalSpaceId: mocks.personalSpaceId }),
}));
vi.mock('./api', async importOriginal => ({
  ...(await importOriginal<typeof import('./api')>()),
  geoNotificationsApiUrl: () => 'https://n.example',
  // Looked up per call: each test assigns fresh functions, and the factory runs only once.
  registerForNotifications: (...args: unknown[]) => mocks.register(...args),
  getNotificationPreferences: (...args: unknown[]) => mocks.get(...args),
  updateNotificationPreferences: (...args: unknown[]) => mocks.update(...args),
}));

const { useNotificationPreferences, useNotificationRegistration, useSaveEmailSwitch } = await import('./hooks');

const allOn = {
  invites: true,
  community_calls: true,
  your_debates: true,
  replies: true,
  digest: true,
  getting_started: true,
};
type Patch = { email_enabled?: boolean; email_groups?: Partial<typeof allOn> };
let server: { in_app_enabled: boolean; email_enabled: boolean; email_groups: typeof allOn };

let client: QueryClient;
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  mocks.authenticated = true;
  mocks.personalSpaceId = 'f3dab79cb5a3d9d1759656dd5361d1c6';
  mocks.register = vi.fn(async () => ({ id: 'u1', user_space_id: 'x', email: 'a@b.com' }));
  mocks.capture = vi.fn();
  server = { in_app_enabled: true, email_enabled: true, email_groups: { ...allOn } };
  mocks.get = vi.fn(async () => structuredClone(server));
  mocks.update = vi.fn(async (_b: string, _t: string, patch: Patch) => {
    server = {
      ...server,
      email_enabled: patch.email_enabled ?? server.email_enabled,
      email_groups: { ...server.email_groups, ...patch.email_groups },
    };
    return structuredClone(server);
  });
});
afterEach(() => client.clear());

describe('registration', () => {
  it('registers the signed-in person once, with their personal space', async () => {
    const { result } = renderHook(() => [useNotificationRegistration(), useNotificationRegistration()], { wrapper });

    await waitFor(() => expect(result.current[0]!.isSuccess).toBe(true));
    expect(mocks.register).toHaveBeenCalledTimes(1);
    expect(mocks.register).toHaveBeenCalledWith('https://n.example', 'tok', 'f3dab79cb5a3d9d1759656dd5361d1c6');
  });

  it('does nothing without a personal space, or signed out', async () => {
    mocks.personalSpaceId = null;
    renderHook(() => useNotificationRegistration(), { wrapper });
    mocks.authenticated = false;
    mocks.personalSpaceId = 'f3dab79cb5a3d9d1759656dd5361d1c6';
    renderHook(() => useNotificationRegistration(), { wrapper });

    await new Promise(resolve => setTimeout(resolve, 20));
    expect(mocks.register).not.toHaveBeenCalled();
  });

  // Registration failing must not break sign-in: it is an error state, not a thrown one.
  it('reports a failed registration as an error state and reads no preferences', { timeout: 10000 }, async () => {
    mocks.register = vi.fn(async () => {
      throw new Error('unreachable');
    });
    const { result } = renderHook(() => useNotificationPreferences(), { wrapper });

    // Registration retries twice (1s, then 2s) before giving up, so this waits out both.
    await waitFor(() => expect(result.current.registration.isError).toBe(true), { timeout: 6000 });
    expect(mocks.register).toHaveBeenCalledTimes(3);
    expect(mocks.get).not.toHaveBeenCalled();
  });
});

describe('saving an email switch', () => {
  const render = () =>
    renderHook(() => ({ ...useNotificationPreferences(), switches: useSaveEmailSwitch() }), { wrapper });

  type Pending = { resolve: (value: unknown) => void; reject: (error: Error) => void; patch: Patch };
  const holdSaves = () => {
    const pending: Pending[] = [];
    mocks.update = vi.fn(
      (_b: string, _t: string, patch: Patch) =>
        new Promise((resolve, reject) => pending.push({ resolve, reject, patch }))
    );
    return pending;
  };

  it('moves the all-email switch at once and keeps what the server saved', async () => {
    const { result } = render();
    await waitFor(() => expect(result.current.preferences.data?.email_enabled).toBe(true));
    expect(result.current.switches.status).toBe('idle');

    act(() => result.current.switches.save({ group: 'all', enabled: false }));

    await waitFor(() => expect(result.current.preferences.data?.email_enabled).toBe(false));
    await waitFor(() => expect(result.current.switches.status).toBe('saved'));
    expect(mocks.update).toHaveBeenCalledWith('https://n.example', 'tok', { email_enabled: false });
    expect(mocks.capture).toHaveBeenCalledWith('email_preference_changed', {
      group: 'all',
      enabled: false,
      surface: 'settings',
    });
  });

  it('saves one group, leaving the others and the all-email switch alone', async () => {
    const { result } = render();
    await waitFor(() => expect(result.current.preferences.data?.email_groups?.digest).toBe(true));

    act(() => result.current.switches.save({ group: 'digest', enabled: false }));

    await waitFor(() => expect(result.current.switches.status).toBe('saved'));
    expect(mocks.update).toHaveBeenCalledWith('https://n.example', 'tok', { email_groups: { digest: false } });
    expect(result.current.preferences.data?.email_groups).toEqual({ ...allOn, digest: false });
    expect(result.current.preferences.data?.email_enabled).toBe(true);
    expect(mocks.capture).toHaveBeenCalledWith('email_preference_changed', {
      group: 'digest',
      enabled: false,
      surface: 'settings',
    });
  });

  it('puts back only its own switch when a save fails', async () => {
    const pending = holdSaves();
    const { result } = render();
    await waitFor(() => expect(result.current.preferences.data?.email_groups?.digest).toBe(true));

    act(() => result.current.switches.save({ group: 'digest', enabled: false }));
    act(() => result.current.switches.save({ group: 'replies', enabled: false }));
    await waitFor(() => expect(pending).toHaveLength(2));
    expect(result.current.preferences.data?.email_groups).toMatchObject({ digest: false, replies: false });

    act(() => pending[0].reject(new Error('500')));
    await waitFor(() => expect(result.current.preferences.data?.email_groups?.digest).toBe(true));
    // The other save is still in flight, and its switch stays where the person put it.
    expect(result.current.preferences.data?.email_groups?.replies).toBe(false);
    expect(mocks.capture).not.toHaveBeenCalled();
  });

  it('does not let an earlier answer flick back a later switch that is still saving', async () => {
    const pending = holdSaves();
    const { result } = render();
    await waitFor(() => expect(result.current.preferences.data?.email_groups?.digest).toBe(true));

    act(() => result.current.switches.save({ group: 'digest', enabled: false }));
    act(() => result.current.switches.save({ group: 'replies', enabled: false }));
    await waitFor(() => expect(pending).toHaveLength(2));

    // The first answer knows only about the digest.
    act(() =>
      pending[0].resolve({ in_app_enabled: true, email_enabled: true, email_groups: { ...allOn, digest: false } })
    );
    await waitFor(() => expect(mocks.capture).toHaveBeenCalledTimes(1));
    expect(result.current.preferences.data?.email_groups?.replies).toBe(false);

    act(() =>
      pending[1].resolve({
        in_app_enabled: true,
        email_enabled: true,
        email_groups: { ...allOn, digest: false, replies: false },
      })
    );
    await waitFor(() => expect(mocks.capture).toHaveBeenCalledTimes(2));
    expect(result.current.preferences.data?.email_groups).toEqual({ ...allOn, digest: false, replies: false });
  });

  // React Query runs a `mutate(…, { onError })` callback only for the latest call, so a status kept
  // by the caller never heard about a failure that settled while another switch was saving.
  it('says a save failed even when another save was pressed while it was in flight', async () => {
    const pending = holdSaves();
    const { result } = render();
    await waitFor(() => expect(result.current.preferences.data?.email_groups?.digest).toBe(true));

    act(() => result.current.switches.save({ group: 'digest', enabled: false }));
    act(() => result.current.switches.save({ group: 'replies', enabled: false }));
    await waitFor(() => expect(pending).toHaveLength(2));

    act(() => pending[0].reject(new Error('500')));
    await waitFor(() => expect(result.current.switches.status).toBe('failed'));

    // Pressed before the failure: its success doesn't cover the switch that went back.
    act(() =>
      pending[1].resolve({ in_app_enabled: true, email_enabled: true, email_groups: { ...allOn, replies: false } })
    );
    await waitFor(() => expect(mocks.capture).toHaveBeenCalledTimes(1));
    expect(result.current.switches.status).toBe('failed');

    // Pressed after it: the person has seen the failure and moved on.
    act(() => result.current.switches.save({ group: 'digest', enabled: false }));
    await waitFor(() => expect(pending).toHaveLength(3));
    act(() =>
      pending[2].resolve({
        in_app_enabled: true,
        email_enabled: true,
        email_groups: { ...allOn, digest: false, replies: false },
      })
    );
    await waitFor(() => expect(result.current.switches.status).toBe('saved'));
  });

  it('ends on what the server holds when the last save to finish fails', async () => {
    const pending = holdSaves();
    const { result } = render();
    await waitFor(() => expect(result.current.preferences.data?.email_groups?.digest).toBe(true));

    // Off, then straight back on, and neither reaches the server.
    act(() => result.current.switches.save({ group: 'digest', enabled: false }));
    act(() => result.current.switches.save({ group: 'digest', enabled: true }));
    await waitFor(() => expect(pending).toHaveLength(2));

    act(() => pending[0].reject(new Error('500')));
    await waitFor(() => expect(result.current.switches.status).toBe('failed'));
    act(() => pending[1].reject(new Error('500')));

    // Putting back the second save's "previous" would show off; the server still has it on.
    await waitFor(() => expect(mocks.get).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.preferences.data?.email_groups?.digest).toBe(true));
  });
});
