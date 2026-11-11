import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

import * as React from 'react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GeoChatRequestError } from '../api';
import { useIsMediaAdmin } from './hooks';

const mocks = vi.hoisted(() => ({
  authenticated: true,
  getMomentBackfill: vi.fn(),
}));

vi.mock('../hooks', () => ({
  debateQueryKeys: { extractedClaims: (id: string) => ['debates', 'extracted-claims', id] },
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
  getDebateTranscriptWords: vi.fn(),
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
