import { renderHook } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const capture = vi.hoisted(() => vi.fn());
vi.mock('~/core/analytics', () => ({ capture }));

const {
  lobbyCreated,
  lobbyDebateRequested,
  lobbyDebateSeen,
  lobbyJoined,
  lobbyLeft,
  lobbyPageClosed,
  lobbyPageMounted,
  lobbyPageUnmounted,
  lobbySteppedOut,
  markLobbyEntry,
  resetLobbyAnalytics,
  useLobbyDebateAnalytics,
} = await import('./lobby-analytics');

const LOBBY = '5f0c1a2b-3c4d-4e5f-8a9b-0c1d2e3f4a5b';
const DASHLESS = LOBBY.replaceAll('-', '');

const events = (name: string) => capture.mock.calls.filter(([event]) => event === name).map(([, props]) => props);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-08T12:00:00Z'));
});

afterEach(() => {
  resetLobbyAnalytics();
  vi.useRealTimers();
  capture.mockClear();
});

describe('lobby sessions', () => {
  it('sends one lobby_joined per visit, in geo-chat’s id spelling, with the marked entry', () => {
    markLobbyEntry(LOBBY, 'side_panel');
    lobbyJoined(LOBBY, { isNewcomer: true });
    // A lapsed lease, a bfcache restore and a reconnect all join again.
    lobbyJoined(DASHLESS, { isNewcomer: true });
    lobbyJoined(LOBBY, { isNewcomer: true });

    expect(events('lobby_joined')).toEqual([
      { lobby_id: DASHLESS, lobby_session_id: expect.any(String), is_newcomer: true, entry: 'side_panel' },
    ]);
  });

  it('falls back to link for an unmarked, stale or other lobby’s entry', () => {
    markLobbyEntry('other', 'side_panel');
    lobbyJoined(LOBBY, { isNewcomer: false });
    lobbyLeft(LOBBY, 'left');

    markLobbyEntry(LOBBY, 'created');
    vi.advanceTimersByTime(61_000);
    lobbyJoined(LOBBY, { isNewcomer: false });

    expect(events('lobby_joined').map(props => props.entry)).toEqual(['link', 'link']);
  });

  it('keeps the session through a StrictMode remount, and ends it on a real unmount', () => {
    lobbyJoined(LOBBY, { isNewcomer: false });
    lobbyPageUnmounted(LOBBY);
    lobbyPageMounted(LOBBY);
    vi.runAllTimers();
    expect(events('lobby_left')).toEqual([]);

    vi.advanceTimersByTime(5_000);
    lobbyPageUnmounted(LOBBY);
    vi.runAllTimers();
    expect(events('lobby_left')).toEqual([
      {
        lobby_id: DASHLESS,
        lobby_session_id: events('lobby_joined')[0]!.lobby_session_id,
        time_in_lobby_ms: 5_000,
        exit: 'left',
      },
    ]);
  });

  it('sends lobby_left once per session', () => {
    lobbyJoined(LOBBY, { isNewcomer: false });
    lobbyLeft(LOBBY, 'left');
    lobbyLeft(LOBBY, 'lobby_ended');
    lobbyPageClosed(LOBBY);
    lobbyPageUnmounted(LOBBY);
    vi.runAllTimers();

    expect(events('lobby_left').map(props => props.exit)).toEqual(['left']);
  });

  it('starts a new session on a join after leaving', () => {
    lobbyJoined(LOBBY, { isNewcomer: false });
    lobbyLeft(LOBBY, 'left');
    markLobbyEntry(LOBBY, 'rejoin');
    lobbyJoined(LOBBY, { isNewcomer: false });

    const [first, second] = events('lobby_joined');
    expect(second!.entry).toBe('rejoin');
    expect(second!.lobby_session_id).not.toBe(first!.lobby_session_id);
  });

  it('ends the last lobby when joining another', () => {
    lobbyJoined(LOBBY, { isNewcomer: false });
    lobbyJoined('other-lobby', { isNewcomer: false });

    expect(events('lobby_left')).toEqual([expect.objectContaining({ lobby_id: DASHLESS, exit: 'left' })]);
  });
});

describe('lobby_debate_started', () => {
  it('after this tab steps out, ends the session with exit debate_started and counts the debate once', () => {
    lobbyJoined(LOBBY, { isNewcomer: true });
    vi.advanceTimersByTime(90_000);
    lobbySteppedOut(LOBBY);
    // The lobby page unmounts on the way into the debate.
    lobbyPageUnmounted(LOBBY);
    vi.runAllTimers();
    expect(events('lobby_left')).toEqual([]);

    vi.advanceTimersByTime(30_000);
    lobbyDebateSeen({ id: 'debate-1', lobby_id: DASHLESS });
    lobbyDebateSeen({ id: 'debate-1', lobby_id: DASHLESS });

    const sessionId = events('lobby_joined')[0]!.lobby_session_id;
    expect(events('lobby_left')).toEqual([
      { lobby_id: DASHLESS, lobby_session_id: sessionId, time_in_lobby_ms: 90_000, exit: 'debate_started' },
    ]);
    expect(events('lobby_debate_started')).toEqual([
      {
        lobby_id: DASHLESS,
        lobby_session_id: sessionId,
        debate_id: 'debate-1',
        is_newcomer: true,
        ms_since_join: 120_000,
      },
    ]);
  });

  it('when the server starts the debate with no step-out from this tab', () => {
    lobbyJoined(LOBBY, { isNewcomer: false });
    vi.advanceTimersByTime(10_000);
    lobbyDebateSeen({ id: 'debate-1', lobby_id: DASHLESS });
    // The heartbeat then says stepped out, and the page unmounts.
    lobbySteppedOut(LOBBY);
    lobbyPageUnmounted(LOBBY);
    vi.runAllTimers();

    expect(events('lobby_left')).toEqual([
      expect.objectContaining({ exit: 'debate_started', time_in_lobby_ms: 10_000 }),
    ]);
    expect(events('lobby_debate_started')).toHaveLength(1);
  });

  it('for a session that ended within the hour, without a second lobby_left', () => {
    lobbyJoined(LOBBY, { isNewcomer: false });
    lobbyLeft(LOBBY, 'left');
    vi.advanceTimersByTime(10 * 60_000);
    lobbyDebateSeen({ id: 'debate-1', lobby_id: DASHLESS });

    expect(events('lobby_left').map(props => props.exit)).toEqual(['left']);
    expect(events('lobby_debate_started')).toHaveLength(1);
  });

  it('from the coordinator’s activity, once however often it re-renders or refetches', () => {
    lobbyJoined(LOBBY, { isNewcomer: false });
    const { rerender } = renderHook(({ debate }) => useLobbyDebateAnalytics(debate), {
      initialProps: { debate: null as { id: string; lobby_id?: string | null } | null },
    });
    rerender({ debate: { id: 'debate-1', lobby_id: DASHLESS } });
    rerender({ debate: { id: 'debate-1', lobby_id: DASHLESS } });
    rerender({ debate: null });
    rerender({ debate: { id: 'debate-1', lobby_id: DASHLESS } });

    expect(events('lobby_debate_started')).toHaveLength(1);
  });

  it('not for another lobby’s debate, an unscoped one, or after the hour', () => {
    lobbyJoined(LOBBY, { isNewcomer: false });
    lobbyDebateSeen({ id: 'debate-1', lobby_id: 'other' });
    lobbyDebateSeen({ id: 'debate-2', lobby_id: null });
    lobbySteppedOut(LOBBY);
    vi.advanceTimersByTime(61 * 60_000);
    lobbyDebateSeen({ id: 'debate-3', lobby_id: DASHLESS });

    expect(events('lobby_debate_started')).toEqual([]);
  });

  it('a new session after coming back without a debate ends the stepped-out one as unknown', () => {
    lobbyJoined(LOBBY, { isNewcomer: false });
    lobbySteppedOut(LOBBY);
    markLobbyEntry(LOBBY, 'back_after_debate');
    lobbyJoined(LOBBY, { isNewcomer: false });

    expect(events('lobby_left').map(props => props.exit)).toEqual(['unknown']);
    expect(events('lobby_joined').map(props => props.entry)).toEqual(['link', 'back_after_debate']);
  });
});

describe('lobby_debate_requested and lobby_created', () => {
  it('records each request once, with the claim as target for a claim request', () => {
    lobbyJoined(LOBBY, { isNewcomer: false });
    lobbyDebateRequested(LOBBY, { kind: 'claim', requestId: 'request-1', claimId: 'claim-1' });
    lobbyDebateRequested(LOBBY, { kind: 'person', requestId: 'challenge-1' });
    // A repeat click reuses the pending challenge.
    lobbyDebateRequested(LOBBY, { kind: 'person', requestId: 'challenge-1' });

    const sessionId = events('lobby_joined')[0]!.lobby_session_id;
    expect(events('lobby_debate_requested')).toEqual([
      {
        lobby_id: DASHLESS,
        lobby_session_id: sessionId,
        request_kind: 'claim',
        request_id: 'request-1',
        target_id: 'claim-1',
      },
      { lobby_id: DASHLESS, lobby_session_id: sessionId, request_kind: 'person', request_id: 'challenge-1' },
    ]);
  });

  it('drops a request outside a session of that lobby', () => {
    lobbyDebateRequested(LOBBY, { kind: 'person', requestId: 'challenge-1' });
    expect(events('lobby_debate_requested')).toEqual([]);
  });

  it('sends lobby_created without measurement_version or any duration key', () => {
    lobbyCreated(LOBBY, { scheduled: true });
    expect(capture).toHaveBeenCalledWith('lobby_created', { lobby_id: DASHLESS, scheduled: true });
  });
});
