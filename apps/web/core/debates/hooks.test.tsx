import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';

import type { ReactNode } from 'react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DebateActivity, DebateRematchSession } from './api';
import { debateQueryKeys, useConsentToDebateRematch, useGeoChatAuth } from './hooks';

const mocks = vi.hoisted(() => ({
  getIdentityToken: vi.fn(),
  getAccessToken: vi.fn(),
  consentToDebateRematch: vi.fn(),
}));

vi.mock('@geogenesis/auth', () => ({
  getIdentityToken: mocks.getIdentityToken,
  usePrivy: () => ({
    ready: true,
    authenticated: true,
    getAccessToken: mocks.getAccessToken,
  }),
}));

vi.mock('./api', async importOriginal => {
  const actual = await importOriginal<typeof import('./api')>();
  return { ...actual, consentToDebateRematch: mocks.consentToDebateRematch };
});

describe('useGeoChatAuth', () => {
  beforeEach(() => {
    mocks.getIdentityToken.mockReset();
    mocks.getAccessToken.mockReset();
    mocks.consentToDebateRematch.mockReset();
  });

  it('uses the Privy identity token for geo-chat session exchange', async () => {
    mocks.getIdentityToken.mockResolvedValue('identity-token');
    mocks.getAccessToken.mockResolvedValue('access-token');

    const { result } = renderHook(() => useGeoChatAuth());

    await expect(result.current.getPrivyIdentityToken()).resolves.toBe('identity-token');
    expect(mocks.getIdentityToken).toHaveBeenCalledTimes(1);
    expect(mocks.getAccessToken).not.toHaveBeenCalled();
  });
});

describe('useConsentToDebateRematch', () => {
  it('replaces stale debate activity with the authoritative rematch session', async () => {
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } });
    const staleActivity: DebateActivity = {
      online: true,
      cooldown_until: null,
      match: null,
      debate: { id: 'debate-1' } as NonNullable<DebateActivity['debate']>,
      rematch: null,
    };
    const session = rematchSession();
    queryClient.setQueryData(debateQueryKeys.activity, staleActivity);
    mocks.consentToDebateRematch.mockResolvedValue(session);

    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useConsentToDebateRematch('debate-1'), { wrapper });

    await act(() => result.current.mutateAsync());

    expect(queryClient.getQueryData(debateQueryKeys.activity)).toEqual({
      online: true,
      cooldown_until: null,
      match: null,
      debate: null,
      rematch: session,
    });
  });
});

function rematchSession(): DebateRematchSession {
  return {
    id: 'rematch-1',
    source_debate_id: 'debate-1',
    source_space_id: 'space-1',
    status: 'browsing',
    participants: [],
    decision_expires_at: '2026-07-02T00:00:20.000Z',
    browsing_expires_at: null,
    request: null,
    converted_debate_id: null,
    recently_rejected_claim_ids: [],
    created_at: '2026-07-02T00:00:00.000Z',
    updated_at: '2026-07-02T00:00:01.000Z',
  };
}
