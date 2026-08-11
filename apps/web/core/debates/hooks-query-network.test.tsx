import { renderHook } from '@testing-library/react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  useCreateDebateChallenge,
  useDebate,
  useDebateActivity,
  useDebateClaims,
  useDebateMedia,
  useDebateRematch,
  useDebateRematchClaims,
  useDebateProfile,
  useDebateSharePrompts,
  useDebateTranscript,
  useSpaceDebates,
} from './hooks';
import { GeoChatRequestError } from './api';

const mocks = vi.hoisted(() => ({
  authenticated: true,
  attention: true,
  queryClient: { invalidateQueries: vi.fn(), setQueryData: vi.fn() },
  queryRefetch: vi.fn(),
  useMutation: vi.fn((options: unknown) => options),
  useQuery: vi.fn((options: unknown) => ({ options, refetch: mocks.queryRefetch })),
  useScope: vi.fn(),
}));

vi.mock('@geogenesis/auth', () => ({
  usePrivy: () => ({ ready: true, authenticated: mocks.authenticated, user: { id: 'user-a' } }),
}));

vi.mock('@tanstack/react-query', async importOriginal => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQuery: mocks.useQuery,
  useMutation: mocks.useMutation,
  useQueryClient: () => mocks.queryClient,
}));

vi.mock('~/core/auth/identity-token', () => ({
  getCachedIdentityToken: vi.fn(),
  useIdentityTokenSync: vi.fn(),
}));

vi.mock('./debate-gateway', () => ({
  useDebateGatewayScope: mocks.useScope,
}));

vi.mock('./debate-attention', () => ({
  useDebateAttention: () => mocks.attention,
}));

beforeEach(() => {
  mocks.authenticated = true;
  mocks.attention = true;
  mocks.queryClient.invalidateQueries.mockClear();
  mocks.queryClient.setQueryData.mockClear();
  mocks.queryRefetch.mockClear();
  mocks.useMutation.mockClear();
  mocks.useQuery.mockClear();
  mocks.useScope.mockClear();
});

describe('debate query network ownership', () => {
  it('disables polling and generic browser refetches for every debate query', () => {
    renderHook(() => {
      useDebateClaims('space-1', ['claim-1'], true);
      useDebateActivity();
      useSpaceDebates('space-1', true);
      useDebate('debate-1', true);
      useDebateRematch('rematch-1');
      useDebateRematchClaims('rematch-1', ['claim-1']);
      useDebateSharePrompts();
      useDebateMedia('debate-1', true);
      useDebateTranscript('debate-1');
    });

    expect(mocks.useQuery).toHaveBeenCalledTimes(9);
    for (const [options] of mocks.useQuery.mock.calls) {
      expect(options).toMatchObject({ retry: false, refetchOnReconnect: false, refetchOnWindowFocus: false });
      expect(options).not.toHaveProperty('refetchInterval');
    }
  });

  it('polls profile eligibility every thirty seconds only while foregrounded and refetches on return', () => {
    const { rerender } = renderHook(() => useDebateProfile('profile-b'));
    expect(mocks.useQuery.mock.calls.at(-1)?.[0]).toMatchObject({ refetchInterval: 30_000 });
    expect(mocks.queryRefetch).not.toHaveBeenCalled();

    mocks.attention = false;
    rerender();
    expect(mocks.useQuery.mock.calls.at(-1)?.[0]).toMatchObject({ refetchInterval: false });

    mocks.attention = true;
    rerender();
    expect(mocks.queryRefetch).toHaveBeenCalledTimes(1);
  });

  it('invalidates the challenged profile after an availability rejection', () => {
    const { result } = renderHook(() => useCreateDebateChallenge());
    const mutation = result.current as unknown as {
      onError(error: Error, request: { recipient_profile_space_id: string }): void;
    };

    mutation.onError(
      new GeoChatRequestError('Unavailable', 'challenge_unavailable', 400),
      { recipient_profile_space_id: 'profile-b' }
    );

    expect(mocks.queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['debates', 'account', 'user-a', 'profile', 'profile-b'],
    });
  });

  it('registers only authenticated space and debate scopes', () => {
    const { rerender } = renderHook(() => {
      useDebateClaims('space-1', ['claim-1'], true);
      useSpaceDebates('space-1', true);
      useDebate('debate-1', true);
      useDebateMedia('debate-1', true);
      useDebateTranscript('debate-1');
    });

    expect(mocks.useScope.mock.calls).toEqual([
      [{ scope: 'space', space_id: 'space-1' }, true],
      [{ scope: 'space', space_id: 'space-1' }, true],
      [{ scope: 'debate', debate_id: 'debate-1' }, true],
      [{ scope: 'debate', debate_id: 'debate-1' }, true],
      [{ scope: 'debate', debate_id: 'debate-1' }, true],
    ]);

    mocks.authenticated = false;
    mocks.useScope.mockClear();
    rerender();
    expect(mocks.useScope.mock.calls.every(([, enabled]) => enabled === false)).toBe(true);
  });
});
