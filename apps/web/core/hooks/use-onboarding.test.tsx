import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';

import * as React from 'react';

import { Effect } from 'effect';
import { Provider as JotaiProvider, createStore } from 'jotai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useOnboarding } from './use-onboarding';

const ADDRESS = '0x1561d60DF8b2840264DEc7f508E911fd708dc41F';
const SPACE_ID = '86892daf69e2411eb9906077c166efdf';

const getSpaceByAddress = vi.fn();

vi.mock('~/core/io/queries', () => ({
  getSpaceByAddress: (address: string) => getSpaceByAddress(address),
}));
vi.mock('~/core/wallet/account-readiness', () => ({
  useAccountReadiness: () => ({ state: 'identified', address: ADDRESS }),
}));
vi.mock('~/core/wallet/auth-hooks', () => ({
  usePrivy: () => ({ user: { id: 'did:privy:1' }, isModalOpen: false }),
  useAccountEffect: () => {},
}));
vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

function Wrapper({ children }: { children: React.ReactNode }) {
  // Retries off so a failure settles at once; the hook's own refetch interval still runs.
  const [client] = React.useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }));
  const [store] = React.useState(createStore);
  return (
    <JotaiProvider store={store}>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </JotaiProvider>
  );
}

/** Renders onboarding and records every visibility it reports. */
function renderOnboarding() {
  const seen: boolean[] = [];
  const hook = renderHook(
    () => {
      const onboarding = useOnboarding();
      seen.push(onboarding.isOnboardingVisible);
      return onboarding;
    },
    { wrapper: Wrapper }
  );
  return { ...hook, seen };
}

const outage = () => Effect.fail(new Error('503 Service temporarily unavailable due to database pressure'));

beforeEach(() => {
  getSpaceByAddress.mockReset();
  window.localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useOnboarding', () => {
  it('never opens while the index answers with errors', async () => {
    // GEO-3803, 2026-11-20: api-testnet answered 503 under database pressure, and the profile
    // prompt opened and closed every few seconds for a registered account with a profile.
    getSpaceByAddress.mockImplementation(outage);

    const { seen } = renderOnboarding();

    // The first failure, then a polled refetch that fails too.
    await waitFor(() => expect(getSpaceByAddress.mock.calls.length).toBeGreaterThanOrEqual(2), { timeout: 10_000 });
    await act(async () => {});
    expect(seen).not.toContain(true);
  }, 20_000);

  it('opens for an account the index really shows as unregistered', async () => {
    getSpaceByAddress.mockReturnValue(Effect.succeed(null));

    const { result } = renderOnboarding();

    await waitFor(() => expect(result.current.isOnboardingVisible).toBe(true));
  });

  it('opens for a registered space the index really shows without a profile', async () => {
    getSpaceByAddress.mockReturnValue(Effect.succeed({ id: SPACE_ID, type: 'PERSONAL', hasProfile: false }));

    const { result } = renderOnboarding();

    await waitFor(() => expect(result.current.isOnboardingVisible).toBe(true));
  });

  it('keeps the answer it has when a later poll fails', async () => {
    getSpaceByAddress.mockReturnValueOnce(Effect.succeed(null));
    getSpaceByAddress.mockImplementation(outage);

    const { result, seen } = renderOnboarding();
    await waitFor(() => expect(result.current.isOnboardingVisible).toBe(true));
    const opened = seen.indexOf(true);

    await waitFor(() => expect(getSpaceByAddress.mock.calls.length).toBeGreaterThanOrEqual(2), { timeout: 10_000 });
    await act(async () => {});

    expect(seen.slice(opened)).not.toContain(false);
  }, 20_000);
});
