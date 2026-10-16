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
}));

vi.mock('@geogenesis/auth', () => ({
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

const { useNotificationPreferences, useNotificationRegistration, useSetEmailNotifications } = await import('./hooks');

let client: QueryClient;
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  mocks.authenticated = true;
  mocks.personalSpaceId = 'f3dab79cb5a3d9d1759656dd5361d1c6';
  mocks.register = vi.fn(async () => ({ id: 'u1', user_space_id: 'x', email: 'a@b.com' }));
  mocks.get = vi.fn(async () => ({ in_app_enabled: true, email_enabled: true }));
  mocks.update = vi.fn(async (_b: string, _t: string, patch: { email_enabled: boolean }) => ({
    in_app_enabled: true,
    email_enabled: patch.email_enabled,
  }));
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

describe('the email switch', () => {
  it('moves at once and keeps what the server saved', async () => {
    const { result } = renderHook(() => ({ ...useNotificationPreferences(), set: useSetEmailNotifications() }), {
      wrapper,
    });
    await waitFor(() => expect(result.current.preferences.data?.email_enabled).toBe(true));

    act(() => result.current.set.mutate(false));

    await waitFor(() => expect(result.current.preferences.data?.email_enabled).toBe(false));
    await waitFor(() => expect(result.current.set.isSuccess).toBe(true));
    expect(mocks.update).toHaveBeenCalledWith('https://n.example', 'tok', { email_enabled: false });
  });

  it('rolls back when the save fails', async () => {
    let fail: (error: Error) => void = () => {};
    mocks.update = vi.fn(() => new Promise((_resolve, reject) => (fail = reject)));
    const { result } = renderHook(() => ({ ...useNotificationPreferences(), set: useSetEmailNotifications() }), {
      wrapper,
    });
    await waitFor(() => expect(result.current.preferences.data?.email_enabled).toBe(true));

    act(() => result.current.set.mutate(false));
    await waitFor(() => expect(result.current.preferences.data?.email_enabled).toBe(false));

    act(() => fail(new Error('500')));
    await waitFor(() => expect(result.current.set.isError).toBe(true));
    expect(result.current.preferences.data?.email_enabled).toBe(true);
  });
});
