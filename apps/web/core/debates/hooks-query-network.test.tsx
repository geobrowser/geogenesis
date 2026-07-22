import { renderHook } from '@testing-library/react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  useDebate,
  useDebateActivity,
  useDebateClaims,
  useDebateMedia,
  useDebateRematch,
  useDebateRematchClaims,
  useDebateSharePrompts,
  useDebateTranscript,
  useSpaceDebates,
} from './hooks';

const mocks = vi.hoisted(() => ({
  authenticated: true,
  useQuery: vi.fn((options: unknown) => options),
  useScope: vi.fn(),
}));

vi.mock('@geogenesis/auth', () => ({
  usePrivy: () => ({ ready: true, authenticated: mocks.authenticated, user: { id: 'user-a' } }),
}));

vi.mock('@tanstack/react-query', async importOriginal => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQuery: mocks.useQuery,
}));

vi.mock('~/core/auth/identity-token', () => ({
  getCachedIdentityToken: vi.fn(),
  useIdentityTokenSync: vi.fn(),
}));

vi.mock('./debate-gateway', () => ({
  useDebateGatewayScope: mocks.useScope,
}));

beforeEach(() => {
  mocks.authenticated = true;
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
