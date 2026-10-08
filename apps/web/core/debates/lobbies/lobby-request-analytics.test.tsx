import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';

import * as React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createDebateChallenge: vi.fn(),
  createDebateRequest: vi.fn(),
  requested: vi.fn(),
}));

vi.mock('@geogenesis/auth', () => ({
  usePrivy: () => ({ ready: true, authenticated: true, user: { id: 'user-a' } }),
}));
vi.mock('~/core/auth/identity-token', () => ({
  getCachedIdentityToken: vi.fn(),
  useIdentityTokenSync: vi.fn(),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock('../api', async importOriginal => ({
  ...(await importOriginal<typeof import('../api')>()),
  createDebateChallenge: mocks.createDebateChallenge,
  createDebateRequest: mocks.createDebateRequest,
}));
vi.mock('./lobby-analytics', async importOriginal => ({
  ...(await importOriginal<typeof import('./lobby-analytics')>()),
  lobbyDebateRequested: mocks.requested,
}));

const { useCreateDebateChallenge } = await import('../hooks');
const { useCreateDebateRequest } = await import('../matchmaking/hooks');

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/** A response the test releases, after the caller has unmounted. */
function deferred<T>(mock: ReturnType<typeof vi.fn>) {
  let resolve: (value: T) => void = () => undefined;
  mock.mockImplementationOnce(() => new Promise<T>(done => (resolve = done)));
  return (value: T) => resolve(value);
}

afterEach(() => vi.clearAllMocks());

describe('lobby requests in analytics', () => {
  it('records a person request the server accepts after the row unmounted', async () => {
    const respond = deferred(mocks.createDebateChallenge);
    const { result, unmount } = renderHook(() => useCreateDebateChallenge(), { wrapper });
    act(() => result.current.mutate({ recipient_profile_space_id: 'space-b', lobby_id: 'lobby1' }));
    unmount();

    await vi.waitFor(() => expect(mocks.createDebateChallenge).toHaveBeenCalled());
    await act(async () => respond({ id: 'challenge-1' }));
    expect(mocks.requested).toHaveBeenCalledWith('lobby1', { kind: 'person', requestId: 'challenge-1' });
  });

  it('records a claim request the server accepts after the card unmounted', async () => {
    const respond = deferred(mocks.createDebateRequest);
    const { result, unmount } = renderHook(() => useCreateDebateRequest(), { wrapper });
    act(() => result.current.mutate({ space_id: 'space-1', claim_entity_id: 'claim-1', lobby_id: 'lobby1' }));
    unmount();

    await vi.waitFor(() => expect(mocks.createDebateRequest).toHaveBeenCalled());
    await act(async () => respond({ id: 'request-1' }));
    expect(mocks.requested).toHaveBeenCalledWith('lobby1', {
      kind: 'claim',
      requestId: 'request-1',
      claimId: 'claim-1',
    });
  });

  it('records nothing for a request outside a lobby, or one the server refused', async () => {
    mocks.createDebateChallenge.mockResolvedValueOnce({ id: 'challenge-1' });
    mocks.createDebateRequest.mockRejectedValueOnce(new Error('refused'));
    const challenge = renderHook(() => useCreateDebateChallenge(), { wrapper });
    const request = renderHook(() => useCreateDebateRequest(), { wrapper });

    act(() => {
      challenge.result.current.mutate({ recipient_profile_space_id: 'space-b' });
      request.result.current.mutate({ space_id: 'space-1', claim_entity_id: 'claim-1', lobby_id: 'lobby1' });
    });
    await vi.waitFor(() => expect(challenge.result.current.isSuccess && request.result.current.isError).toBe(true));
    expect(mocks.requested).not.toHaveBeenCalled();
  });
});
