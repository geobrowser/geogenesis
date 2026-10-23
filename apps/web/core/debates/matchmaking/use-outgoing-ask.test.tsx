import '@testing-library/jest-dom/vitest';
import { act, renderHook } from '@testing-library/react';

import * as React from 'react';

import { Provider, createStore } from 'jotai';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  activity: undefined as unknown,
  requests: undefined as unknown,
  withdraw: vi.fn(),
  reject: vi.fn(),
}));

vi.mock('../hooks', () => ({
  useGeoChatAuth: () => ({ authenticated: true, ready: true, accountKey: 'user-a' }),
  useDebateActivity: () => ({ data: mocks.activity }),
  useRejectDebateChallenge: () => ({ mutate: mocks.reject, isPending: false }),
}));
vi.mock('./hooks', () => ({
  useDebateRequests: () => ({ data: mocks.requests }),
  useWithdrawDebateRequest: () => ({ mutate: mocks.withdraw, isPending: false }),
}));
vi.mock('../use-current-geo-chat-user-id', () => ({ useCurrentGeoChatUserId: () => 'me' }));
// The server clock costs round trips; the local one cannot be wrong about a countdown in a test.
vi.mock('./use-request-countdown', async importOriginal => ({
  ...(await importOriginal<typeof import('./use-request-countdown')>()),
  useServerClock: () => null,
}));

const { askIsForClaim, askIsForPerson, formatAskClock, useOutgoingAsk } = await import('./use-outgoing-ask');

const inAMinute = () => new Date(Date.now() + 60_000).toISOString();

function claimRequest(id = 'req-1') {
  return {
    id,
    status: 'pending',
    claim: { id: 'dc', space_id: 'space1', claim_entity_id: 'claim-1', claim: 'A claim', description: null },
    created_at: new Date().toISOString(),
    expires_at: inAMinute(),
  };
}

function challenge(requester = 'me') {
  return {
    id: 'ch-1',
    status: 'pending',
    requester: { user_id: requester, profile_space_id: 'mine', display_name: 'Me', avatar_cid: null },
    recipient: { user_id: 'them', profile_space_id: 'theirs-1', display_name: 'Ana Ruiz', avatar_cid: null },
    created_at: new Date().toISOString(),
    expires_at: inAMinute(),
  };
}

function renderAsk() {
  const store = createStore();
  return renderHook(() => useOutgoingAsk(), {
    wrapper: ({ children }: { children: React.ReactNode }) => <Provider store={store}>{children}</Provider>,
  });
}

afterEach(() => {
  mocks.activity = undefined;
  mocks.requests = undefined;
  vi.clearAllMocks();
});

describe('formatAskClock', () => {
  it('reads m:ss, rounding up so an open ask never says 0:00', () => {
    expect(formatAskClock(90_000)).toBe('1:30');
    expect(formatAskClock(72_400)).toBe('1:13');
    expect(formatAskClock(500)).toBe('0:01');
    expect(formatAskClock(0)).toBe('0:00');
  });
});

describe('useOutgoingAsk', () => {
  it('reads a pending claim request as the open ask, and cancels it by withdrawing', () => {
    mocks.requests = { outbound: claimRequest(), incoming: [] };
    const { result } = renderAsk();

    expect(result.current.ask).toMatchObject({ kind: 'claim', id: 'req-1' });
    expect(askIsForClaim(result.current.ask, 'claim-1')).toBe(true);

    act(() => result.current.cancel());
    expect(mocks.withdraw).toHaveBeenCalledWith('req-1');
  });

  it('reads a challenge the viewer sent, not one they received', () => {
    mocks.activity = { challenge: challenge('someone-else') };
    const { result, rerender } = renderAsk();
    expect(result.current.ask).toBeNull();

    mocks.activity = { challenge: challenge() };
    rerender();
    expect(result.current.ask).toMatchObject({ kind: 'person', recipientName: 'Ana Ruiz' });
    expect(askIsForPerson(result.current.ask, 'theirs-1')).toBe(true);

    act(() => result.current.cancel());
    expect(mocks.reject).toHaveBeenCalledWith('ch-1');
  });

  it('reports an ask that ended with no debate behind it as ended, until dismissed', () => {
    mocks.requests = { outbound: claimRequest('req-ended'), incoming: [] };
    const { result, rerender } = renderAsk();

    mocks.requests = { outbound: null, incoming: [] };
    rerender();
    expect(result.current.ended).toMatchObject({ kind: 'claim', id: 'req-ended' });

    act(() => result.current.dismissEnded());
    expect(result.current.ended).toBeNull();
  });

  it('does not call an accepted ask ended: a debate started behind it', () => {
    mocks.requests = { outbound: claimRequest(), incoming: [] };
    const { result, rerender } = renderAsk();

    mocks.requests = { outbound: null, incoming: [] };
    mocks.activity = { debate: { id: 'debate-1', status: 'ready', recording_cancelled_at: null } };
    rerender();

    expect(result.current.ended).toBeNull();
  });

  it('does not call an ask the viewer cancelled ended', () => {
    mocks.requests = { outbound: claimRequest('req-2'), incoming: [] };
    const { result, rerender } = renderAsk();

    act(() => result.current.cancel());
    mocks.requests = { outbound: null, incoming: [] };
    rerender();

    expect(result.current.ended).toBeNull();
  });
});
