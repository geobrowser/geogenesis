import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

import type React from 'react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GeoChatRequestError } from '~/core/debates/api';

import { debateRequestErrorMessage, useClaimMatchup } from './use-claim-matchup';

const mocks = vi.hoisted(() => ({
  notify: vi.fn(() => Promise.resolve()),
  mutate: vi.fn(),
  /** What the next request fails with, or null for a request that goes through. */
  failWith: null as Error | null,
  outbound: null as { id: string; status: string; expires_at: string } | null,
  challenge: null as { id: string; status: string; expires_at: string; requester: { user_id: string } } | null,
}));

vi.mock('~/core/debates/api', async importOriginal => ({
  ...(await importOriginal<typeof import('~/core/debates/api')>()),
  notifyClaimResponseIndexed: (...args: unknown[]) => mocks.notify(...(args as [])),
}));

vi.mock('~/core/debates/hooks', () => ({
  useDebateActivity: () => ({ data: { available_to_debate: true, challenge: mocks.challenge } }),
  useGeoChatAuth: () => ({ accountKey: 'account-1', getPrivyIdentityToken: () => Promise.resolve('token') }),
}));

vi.mock('~/core/debates/matchmaking/hooks', () => ({
  useMatchmakingMatches: () => ({ data: { matches: [] } }),
  useDebateRequests: () => ({ data: { incoming: [], outbound: mocks.outbound } }),
  useCreateDebateRequest: () => ({
    isPending: false,
    error: mocks.failWith,
    mutate: (body: unknown, options?: { onError?: (error: Error) => void }) => {
      mocks.mutate(body);
      if (mocks.failWith) options?.onError?.(mocks.failWith);
    },
  }),
}));

vi.mock('~/core/debates/use-current-geo-chat-user-id', () => ({ useCurrentGeoChatUserId: () => 'user-me' }));

const intentMissing = () =>
  new GeoChatRequestError('respond to this claim before sending a debate request', 'intent_missing', 400);

function setup({
  viewerPosition,
  indexedViewerPosition,
}: {
  viewerPosition: boolean | null | undefined;
  indexedViewerPosition?: boolean | null;
}) {
  const queryClient = new QueryClient();
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(
    () => useClaimMatchup({ claimId: 'claim-1', spaceId: 'space-1', viewerPosition, indexedViewerPosition }),
    { wrapper }
  );
  return { result, invalidate };
}

beforeEach(() => {
  mocks.notify.mockClear();
  mocks.mutate.mockClear();
  mocks.failWith = null;
  mocks.outbound = null;
  mocks.challenge = null;
});

// The strip says "Nobody took it this time" at `expires_at`; every card and "Debate on this" kept
// saying to withdraw it until geo-chat's own expiry event caught up.
describe('the viewer’s open request', () => {
  const outbound = (expiresInMs: number) => ({
    id: 'r-open',
    status: 'pending',
    expires_at: new Date(Date.now() + expiresInMs).toISOString(),
  });

  it('blocks another request while it is live', () => {
    mocks.outbound = outbound(60_000);
    const { result } = setup({ viewerPosition: true });
    expect(result.current.blockedReason).toBe('Withdraw your open request to send another.');
  });

  it('no longer blocks one once it has run out, before geo-chat says so', () => {
    mocks.outbound = outbound(-1_000);
    const { result } = setup({ viewerPosition: true });
    expect(result.current.blockedReason).toBeUndefined();
  });
});

// geo-chat allows a claim request beside a challenge, but the panel's strip keeps one ask, so the
// claim's ending would never show (GEO-3463).
describe('the viewer’s open challenge', () => {
  const challenge = (requester: string, expiresInMs: number) => ({
    id: 'c-open',
    status: 'pending',
    expires_at: new Date(Date.now() + expiresInMs).toISOString(),
    requester: { user_id: requester },
  });

  it('blocks a claim request while one the viewer sent is live', () => {
    mocks.challenge = challenge('user-me', 60_000);
    const { result } = setup({ viewerPosition: true });
    expect(result.current.blockedReason).toBe('Cancel your challenge to send a request.');
  });

  it('does not block for a challenge someone sent the viewer, or one that has run out', () => {
    mocks.challenge = challenge('user-them', 60_000);
    expect(setup({ viewerPosition: true }).result.current.blockedReason).toBeUndefined();
    mocks.challenge = challenge('user-me', -1_000);
    expect(setup({ viewerPosition: true }).result.current.blockedReason).toBeUndefined();
  });
});

/**
 * `intent_missing` is geo-chat finding no readiness behind the request. Printed raw, it told a reader
 * whose Agree was plainly held to "respond to this claim" — true of geo-chat's copy, and nothing
 * they could act on from the page.
 */
describe('a request refused for missing intent', () => {
  it('re-reports a side the chain holds, then asks for readiness again', async () => {
    mocks.failWith = intentMissing();
    const { result, invalidate } = setup({ viewerPosition: true, indexedViewerPosition: true });

    result.current.request();

    expect(mocks.notify).toHaveBeenCalledTimes(1);
    expect(mocks.notify.mock.calls[0]?.slice(0, 4)).toEqual(['space-1', 'claim-1', 'stance', true]);
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ['debates', 'claims', 'space-1'] }));
    expect(result.current.requestError).toBe('Your response is still confirming — try again in a moment.');
  });

  it('reports nothing the chain does not hold, and still refreshes', async () => {
    // A side still confirming: the in-flight write has told geo-chat already, and the indexed read
    // has not seen it, so there is nothing true to report yet.
    mocks.failWith = intentMissing();
    const { result, invalidate } = setup({ viewerPosition: true, indexedViewerPosition: null });

    result.current.request();

    expect(mocks.notify).not.toHaveBeenCalled();
    await waitFor(() => expect(invalidate).toHaveBeenCalled());
    expect(result.current.requestError).toBe('Your response is still confirming — try again in a moment.');
  });

  it('reports nothing where the pills and the chain disagree', () => {
    // The viewer has just cleared a side the indexed read still holds.
    mocks.failWith = intentMissing();
    const { result } = setup({ viewerPosition: null, indexedViewerPosition: true });

    result.current.request();

    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it('asks for a side, in the page’s words, where the viewer holds none', () => {
    mocks.failWith = intentMissing();
    const { result } = setup({ viewerPosition: null });

    result.current.request();

    expect(mocks.notify).not.toHaveBeenCalled();
    expect(result.current.requestError).toBe('Choose Agree or Disagree first.');
  });
});

describe('debateRequestErrorMessage', () => {
  it('passes any other refusal through as geo-chat worded it', () => {
    const error = new GeoChatRequestError('no one is available', 'no_candidate', 409);

    expect(debateRequestErrorMessage(error, true)).toBe('no one is available');
    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it('never prints the raw intent_missing text', () => {
    for (const position of [true, false, null, undefined]) {
      expect(debateRequestErrorMessage(intentMissing(), position)).not.toMatch(/respond to this claim/);
    }
  });

  it('says nothing where nothing failed', () => {
    expect(debateRequestErrorMessage(null, true)).toBeNull();
  });
});
