import { act, cleanup, render } from '@testing-library/react';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  reports: [] as { name: string; extra?: Record<string, unknown> }[],
}));

// The Privy chunk failing to download: an ad blocker, a deploy that removed it, a flaky network.
vi.mock('./privy-host', () => {
  throw new TypeError('Failed to fetch dynamically imported module');
});
vi.mock('~/core/telemetry/logger', () => ({
  reportEvent: (event: (typeof mocks.reports)[number]) => void mocks.reports.push(event),
}));
vi.mock('~/core/analytics', async importOriginal => ({
  ...((await importOriginal()) as Record<string, unknown>),
  capture: vi.fn(),
  captureExperimental: vi.fn(),
}));

const { AuthRoot } = await import('./auth-root');
const { getState, requestRealAuth, resetAuthStore } = await import('./auth-store');
const { beginAuthAttempt, openAuthAttempt, resetAuthAttempt } = await import('~/core/auth-attempt');
const { resetSignInReports } = await import('~/core/auth/sign-in-reports');

beforeEach(() => {
  mocks.reports.length = 0;
  resetAuthStore();
  resetAuthAttempt();
  resetSignInReports();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it('reports a Privy chunk that would not load for an open sign-in', async () => {
  beginAuthAttempt({ component: 'navbar' });
  openAuthAttempt();
  render(<AuthRoot />);
  await act(async () => requestRealAuth());
  await vi.waitFor(() => expect(getState().hostFailed).toBe(true));

  expect(mocks.reports).toEqual([
    expect.objectContaining({
      name: 'sign_in_load_failed',
      tags: expect.objectContaining({ privy_host_failed: true, component: 'navbar' }),
      extra: expect.objectContaining({ reason: 'chunk_load' }),
    }),
  ]);
});
