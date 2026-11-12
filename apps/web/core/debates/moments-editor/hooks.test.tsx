import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

import * as React from 'react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GeoChatRequestError } from '../api';
import { useIsMediaAdmin, useRefreshAfterReel } from './hooks';

const mocks = vi.hoisted(() => ({
  authenticated: true,
  getMomentBackfill: vi.fn(),
}));

vi.mock('../hooks', () => ({
  debateQueryKeys: {
    extractedClaims: (id: string) => ['debates', 'extracted-claims', id],
    media: (id: string) => ['debates', 'media', id],
    transcripts: (id: string) => ['debates', 'transcript', id],
    momentReelPlan: (id: string, account: string | null) => ['debates', 'account', account, 'moment-reel-plan', id],
    mediaAdmin: (account: string | null) => ['debates', 'account', account, 'media-admin'],
  },
  debateQueryNetworkOptions: { retry: false, refetchOnReconnect: false, refetchOnWindowFocus: false },
  useGeoChatAuth: () => ({
    ready: true,
    authenticated: mocks.authenticated,
    accountKey: 'account',
    getPrivyIdentityToken: async () => 'token',
  }),
}));

vi.mock('./api', () => ({
  getMomentBackfill: mocks.getMomentBackfill,
  postMomentBackfill: vi.fn(),
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  mocks.authenticated = true;
  mocks.getMomentBackfill.mockReset();
});

describe('useIsMediaAdmin (GEO-3671)', () => {
  it('is true once geo-chat answers its admin read', async () => {
    mocks.getMomentBackfill.mockResolvedValue({ request: null, entry: null });
    const { result } = renderHook(() => useIsMediaAdmin('debate', true), { wrapper });
    await waitFor(() => expect(result.current).toBe(true));
  });

  it.each([
    ['off the allowlist', new GeoChatRequestError('no', 'media_admin_required', 403)],
    ['with no admins configured', new GeoChatRequestError('no', 'media_admin_not_configured', 503)],
  ])('is false for a viewer %s, and does not ask again', async (_, refusal) => {
    mocks.getMomentBackfill.mockRejectedValue(refusal);
    const { result } = renderHook(() => useIsMediaAdmin('debate', true), { wrapper });
    await waitFor(() => expect(mocks.getMomentBackfill).toHaveBeenCalled());
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(result.current).toBe(false);
    expect(mocks.getMomentBackfill).toHaveBeenCalledTimes(1);
  });

  // The feed asks on the active card only, so each debate scrolled to mounts or enables another
  // observer. A refusal kept as an error (no data) is stale whatever its staleTime, and each one
  // asked geo-chat again: one 403 per debate per non-admin.
  it('does not ask again for the next card once geo-chat has refused', async () => {
    mocks.getMomentBackfill.mockRejectedValue(new GeoChatRequestError('no', 'media_admin_required', 403));
    const client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } });
    const shared = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const first = renderHook(() => useIsMediaAdmin('debate-1', true), { wrapper: shared });
    await waitFor(() => expect(mocks.getMomentBackfill).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(first.result.current).toBe(false));
    first.unmount();

    const next = renderHook(({ active }) => useIsMediaAdmin('debate-2', active), {
      wrapper: shared,
      initialProps: { active: false },
    });
    next.rerender({ active: true });
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(next.result.current).toBe(false);
    expect(mocks.getMomentBackfill).toHaveBeenCalledTimes(1);
  });

  it('is false while geo-chat cannot be reached', async () => {
    mocks.getMomentBackfill.mockRejectedValue(new GeoChatRequestError('down', null, 500));
    const { result } = renderHook(() => useIsMediaAdmin('debate', true), { wrapper });
    await waitFor(() => expect(mocks.getMomentBackfill).toHaveBeenCalledTimes(3));
    expect(result.current).toBe(false);
  });

  it('asks nothing signed out', () => {
    mocks.authenticated = false;
    const { result } = renderHook(() => useIsMediaAdmin('debate', true), { wrapper });
    expect(result.current).toBe(false);
    expect(mocks.getMomentBackfill).not.toHaveBeenCalled();
  });
});

describe('useRefreshAfterReel (GEO-3671)', () => {
  // A re-render moves the video, and the editor maps every live cut onto the player's clock through
  // the media's turns, and snaps and judges clips by the transcript's words, which a re-render that
  // re-extracts has changed: all are read again with the plan.
  it('reads the plan, the served moments, the media and the transcript again', () => {
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useRefreshAfterReel('debate'), {
      wrapper: ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    });
    result.current();
    expect(invalidate.mock.calls.map(([filters]) => filters?.queryKey)).toEqual([
      ['debates', 'account', 'account', 'moment-reel-plan', 'debate'],
      ['debates', 'extracted-claims', 'debate'],
      ['debates', 'media', 'debate'],
      ['debates', 'transcript', 'debate'],
    ]);
  });
});
