import '@testing-library/jest-dom/vitest';
import { act, renderHook } from '@testing-library/react';

import * as React from 'react';

import { Provider, createStore } from 'jotai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authenticated: true,
  accountKey: 'user-a' as string | null,
  activity: undefined as unknown,
  requests: undefined as unknown,
  withdraw: vi.fn(),
  reject: vi.fn(),
}));

vi.mock('../hooks', () => ({
  useGeoChatAuth: () => ({ authenticated: mocks.authenticated, ready: true, accountKey: mocks.accountKey }),
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

const { askIsForClaim, askIsForPerson, ENDED_ASK_TTL_MS, useOutgoingAsk } = await import('./use-outgoing-ask');
const { HubAskProvider, useHubAskState } = await import('./hub-ask-context');
const { markAskWithdrawn } = await import('./ask-withdrawals');
const { formatCountdownClock } = await import('./use-request-countdown');

const inAMinute = () => new Date(Date.now() + 60_000).toISOString();

let nextId = 0;
/** A fresh id per test: the withdrawn set is module-level, as it is in the app. */
const uniqueId = (prefix: string) => `${prefix}-${++nextId}`;

function claimRequest(id: string) {
  return {
    id,
    status: 'pending',
    claim: { id: 'dc', space_id: 'space1', claim_entity_id: 'claim-1', claim: 'A claim', description: null },
    created_at: new Date().toISOString(),
    expires_at: inAMinute(),
  };
}

function challenge(id: string, requester = 'me') {
  return {
    id,
    status: 'pending',
    requester: { user_id: requester, profile_space_id: 'mine', display_name: 'Me', avatar_cid: null },
    recipient: { user_id: 'them', profile_space_id: 'theirs-1', display_name: 'Ana Ruiz', avatar_cid: null },
    created_at: new Date().toISOString(),
    expires_at: inAMinute(),
  };
}

function renderAsk(store = createStore()) {
  return renderHook(() => useOutgoingAsk(), {
    wrapper: ({ children }: { children: React.ReactNode }) => <Provider store={store}>{children}</Provider>,
  });
}

beforeEach(() => {
  // A successful withdraw or reject records itself, as the real mutations do on success.
  mocks.withdraw.mockImplementation((id: string) => markAskWithdrawn(id));
  mocks.reject.mockImplementation((id: string) => markAskWithdrawn(id));
});

afterEach(() => {
  mocks.authenticated = true;
  mocks.accountKey = 'user-a';
  mocks.activity = undefined;
  mocks.requests = undefined;
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe('formatCountdownClock', () => {
  it('reads m:ss, rounding up so an open ask never says 0:00', () => {
    expect(formatCountdownClock(90_000)).toBe('1:30');
    expect(formatCountdownClock(72_400)).toBe('1:13');
    expect(formatCountdownClock(500)).toBe('0:01');
    expect(formatCountdownClock(0)).toBe('0:00');
  });
});

describe('useOutgoingAsk', () => {
  it('reads a pending claim request as the open ask, and cancels it by withdrawing', () => {
    const id = uniqueId('req');
    mocks.requests = { outbound: claimRequest(id), incoming: [] };
    const { result } = renderAsk();

    expect(result.current.ask).toMatchObject({ kind: 'claim', id });
    expect(askIsForClaim(result.current.ask, 'claim-1')).toBe(true);

    act(() => result.current.cancel());
    expect(mocks.withdraw).toHaveBeenCalledWith(id);
  });

  it('reads a challenge the viewer sent, not one they received', () => {
    mocks.activity = { challenge: challenge(uniqueId('ch'), 'someone-else') };
    const { result, rerender } = renderAsk();
    expect(result.current.ask).toBeNull();

    const id = uniqueId('ch');
    mocks.activity = { challenge: challenge(id) };
    rerender();
    expect(result.current.ask).toMatchObject({ kind: 'person', recipientName: 'Ana Ruiz' });
    expect(askIsForPerson(result.current.ask, 'theirs-1')).toBe(true);

    act(() => result.current.cancel());
    expect(mocks.reject).toHaveBeenCalledWith(id);
  });

  it('reports an ask that ended with no debate behind it as ended, until dismissed', () => {
    const id = uniqueId('req');
    mocks.requests = { outbound: claimRequest(id), incoming: [] };
    const { result, rerender } = renderAsk();

    mocks.requests = { outbound: null, incoming: [] };
    rerender();
    expect(result.current.ended).toMatchObject({ kind: 'claim', id });

    act(() => result.current.dismissEnded());
    expect(result.current.ended).toBeNull();
  });

  it('does not call an accepted ask ended: a debate started behind it', () => {
    mocks.requests = { outbound: claimRequest(uniqueId('req')), incoming: [] };
    const { result, rerender } = renderAsk();

    mocks.requests = { outbound: null, incoming: [] };
    mocks.activity = { debate: { id: 'debate-1', status: 'ready', recording_cancelled_at: null } };
    rerender();

    expect(result.current.ended).toBeNull();
  });

  // The requests list can drop an accepted request a beat before activity reports the debate.
  it('takes "ended" back once the debate shows up a beat late', () => {
    mocks.requests = { outbound: claimRequest(uniqueId('req')), incoming: [] };
    const { result, rerender } = renderAsk();

    mocks.requests = { outbound: null, incoming: [] };
    rerender();
    expect(result.current.ended).not.toBeNull();

    mocks.activity = { debate: { id: 'debate-1', status: 'ready', recording_cancelled_at: null } };
    rerender();
    expect(result.current.ended).toBeNull();
  });

  it('does not call an ask the viewer cancelled ended', () => {
    mocks.requests = { outbound: claimRequest(uniqueId('req')), incoming: [] };
    const { result, rerender } = renderAsk();

    act(() => result.current.cancel());
    mocks.requests = { outbound: null, incoming: [] };
    rerender();

    expect(result.current.ended).toBeNull();
  });

  // Full screen's sent-request card and the lobby withdraw through the same mutation, not this hook.
  it('does not call an ask taken back somewhere else ended', () => {
    const id = uniqueId('req');
    mocks.requests = { outbound: claimRequest(id), incoming: [] };
    const { result, rerender } = renderAsk();

    markAskWithdrawn(id);
    mocks.requests = { outbound: null, incoming: [] };
    rerender();

    expect(result.current.ended).toBeNull();
  });

  it('never says nobody took it to someone who just signed out', () => {
    mocks.requests = { outbound: claimRequest(uniqueId('req')), incoming: [] };
    const { result, rerender } = renderAsk();

    mocks.authenticated = false;
    mocks.accountKey = null;
    rerender();
    expect(result.current.ended).toBeNull();

    // The request ran out while they were away. Back as the same person: the request went because they signed out, not because nobody took it.
    mocks.requests = { outbound: null, incoming: [] };
    mocks.authenticated = true;
    mocks.accountKey = 'user-a';
    rerender();
    expect(result.current.ended).toBeNull();
  });

  it('keeps one account’s ended ask from the next account on the device', () => {
    const store = createStore();
    mocks.requests = { outbound: claimRequest(uniqueId('req')), incoming: [] };
    const { result, rerender } = renderAsk(store);
    mocks.requests = { outbound: null, incoming: [] };
    rerender();
    expect(result.current.ended).not.toBeNull();

    mocks.accountKey = 'user-b';
    rerender();

    expect(result.current.ended).toBeNull();
  });

  it('lets "nobody took it" go after a few minutes', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    mocks.requests = { outbound: claimRequest(uniqueId('req')), incoming: [] };
    const { result, rerender } = renderAsk();
    mocks.requests = { outbound: null, incoming: [] };
    rerender();
    expect(result.current.ended).not.toBeNull();

    act(() => vi.advanceTimersByTime(ENDED_ASK_TTL_MS + 1));

    expect(result.current.ended).toBeNull();
  });
});

// Every surface reads one `useOutgoingAsk`. Two would each remember the previous ask and race over
// whether the one that went had ended: Cancel from one, and the other said nobody took it.
describe('HubAskProvider', () => {
  it('gives every consumer the same reading, so Cancel never reads as nobody taking it', () => {
    mocks.requests = { outbound: claimRequest(uniqueId('req')), incoming: [] };
    const store = createStore();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <Provider store={store}>
        <HubAskProvider>{children}</HubAskProvider>
      </Provider>
    );
    const { result, rerender } = renderHook(() => ({ strip: useHubAskState(), row: useHubAskState() }), { wrapper });

    act(() => result.current.strip.cancel());
    mocks.requests = { outbound: null, incoming: [] };
    rerender();

    expect(result.current.strip.ended).toBeNull();
    expect(result.current.row.ended).toBeNull();
  });
});
