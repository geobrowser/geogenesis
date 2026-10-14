import { renderHook } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const capture = vi.hoisted(() => vi.fn());
vi.mock('~/core/analytics', () => ({ capture }));

const {
  lobbyCreated,
  lobbyDebateRequested,
  lobbyDebateSeen,
  lobbyEnded,
  lobbyHeadcount,
  lobbyJoined,
  lobbyLeft,
  lobbyPageClosed,
  lobbyPageMounted,
  lobbyPageUnmounted,
  lobbyRoomVoteSeen,
  lobbyRoomVoteStarted,
  lobbyRsvpChanged,
  lobbySteppedOut,
  lobbyViewerRole,
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

  // The queries take each person's first join, so an unknown flag must not read as not new.
  it('leaves is_newcomer out when geo-chat did not send it', () => {
    lobbyJoined(LOBBY, { isNewcomer: null });
    lobbySteppedOut(LOBBY);
    lobbyDebateSeen({ id: 'debate-1', lobby_id: DASHLESS });

    expect(events('lobby_joined')[0]).not.toHaveProperty('is_newcomer');
    expect(events('lobby_debate_started')[0]).not.toHaveProperty('is_newcomer');
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

describe('a debate or request for a lobby the viewer moved on from', () => {
  const OTHER = 'b'.repeat(32);

  it('counts a debate for the earlier lobby once, against its session, within the hour', () => {
    lobbyJoined(LOBBY, { isNewcomer: true });
    const first = events('lobby_joined')[0]!.lobby_session_id;
    lobbyJoined(OTHER, { isNewcomer: true });
    vi.advanceTimersByTime(10 * 60_000);
    lobbyDebateSeen({ id: 'debate-1', lobby_id: DASHLESS });
    lobbyDebateSeen({ id: 'debate-1', lobby_id: DASHLESS });

    expect(events('lobby_debate_started')).toEqual([
      expect.objectContaining({ lobby_id: DASHLESS, lobby_session_id: first, debate_id: 'debate-1' }),
    ]);
    // The earlier session already left when the viewer moved; the current one is untouched.
    expect(events('lobby_left')).toEqual([expect.objectContaining({ lobby_session_id: first, exit: 'left' })]);
  });

  it('drops it after the hour', () => {
    lobbyJoined(LOBBY, { isNewcomer: false });
    lobbyJoined(OTHER, { isNewcomer: false });
    vi.advanceTimersByTime(61 * 60_000);
    lobbyDebateSeen({ id: 'debate-1', lobby_id: DASHLESS });

    expect(events('lobby_debate_started')).toEqual([]);
  });

  it('counts a request answered after moving on against the lobby it was sent from', () => {
    lobbyJoined(LOBBY, { isNewcomer: false });
    const first = events('lobby_joined')[0]!.lobby_session_id;
    lobbyJoined(OTHER, { isNewcomer: false });
    lobbyDebateRequested(LOBBY, { kind: 'person', requestId: 'challenge-1' });

    expect(events('lobby_debate_requested')).toEqual([
      expect.objectContaining({ lobby_id: DASHLESS, lobby_session_id: first, request_id: 'challenge-1' }),
    ]);
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

// GEO-3129. Guests are counted by ordinary page events; lobby_* events are members only.
describe('a visit without an account', () => {
  it('sends no lobby events for the page coming and going without a join', () => {
    lobbyPageMounted(LOBBY);
    lobbyPageUnmounted(LOBBY);
    vi.runAllTimers();
    lobbyPageMounted(LOBBY);
    lobbyPageClosed(LOBBY);
    lobbyLeft(LOBBY, 'left');
    expect(capture).not.toHaveBeenCalled();
  });

  it('sends one lobby_joined, entry link, when the guest signs in and joins', () => {
    lobbyPageMounted(LOBBY);
    lobbyJoined(LOBBY, { isNewcomer: true });
    lobbyJoined(LOBBY, { isNewcomer: true });
    expect(events('lobby_joined')).toEqual([expect.objectContaining({ lobby_id: DASHLESS, entry: 'link' })]);
  });
});

describe('roles (GEO-3311)', () => {
  const lobby = 'a1000000000000000000000000000001';

  it('puts the role at join on lobby_joined, and leaves it out when geo-chat did not say', () => {
    lobbyJoined(lobby, { isNewcomer: false, role: 'listener', hosting: false });
    lobbyLeft(lobby, 'left');
    lobbyJoined(lobby, { isNewcomer: false });

    const [first, second] = events('lobby_joined');
    expect(first).toMatchObject({ role: 'listener', hosting: false });
    expect(second).not.toHaveProperty('role');
    expect(second).not.toHaveProperty('hosting');
  });

  it('reports each change once, naming the host action that landed with it', () => {
    lobbyJoined(lobby, { isNewcomer: false, role: 'listener', hosting: false, moderationAt: null });
    // The views that follow the join repeat it.
    lobbyViewerRole(lobby, { role: 'listener', hosting: false, moderation: null });
    const moved = { action: 'move_to_speakers', at: '2026-10-08T12:01:00Z' };
    lobbyViewerRole(lobby, { role: 'speaker', hosting: false, moderation: moved });
    lobbyViewerRole(lobby, { role: 'speaker', hosting: false, moderation: moved });
    // The only host left: hosting with no action on the viewer.
    lobbyViewerRole(lobby, { role: 'speaker', hosting: true, moderation: moved });

    expect(events('lobby_role_changed')).toEqual([
      {
        lobby_id: lobby,
        lobby_session_id: expect.any(String),
        role: 'speaker',
        hosting: false,
        previous_role: 'listener',
        previous_hosting: false,
        moderation_action: 'move_to_speakers',
      },
      {
        lobby_id: lobby,
        lobby_session_id: expect.any(String),
        role: 'speaker',
        hosting: true,
        previous_role: 'speaker',
        previous_hosting: false,
      },
    ]);
  });

  it('takes the first role after a join that did not say as known, not as a change', () => {
    lobbyJoined(lobby, { isNewcomer: false });
    lobbyViewerRole(lobby, { role: 'speaker', hosting: false, moderation: null });
    expect(events('lobby_role_changed')).toEqual([]);
  });

  it('sends nothing for a role read outside the room', () => {
    lobbyViewerRole(lobby, { role: 'host', hosting: true, moderation: null });
    lobbyJoined(lobby, { isNewcomer: false, role: 'listener', hosting: false });
    lobbySteppedOut(lobby);
    lobbyViewerRole(lobby, { role: 'speaker', hosting: false, moderation: null });
    expect(events('lobby_role_changed')).toEqual([]);
  });
});

describe('headcount (GEO-3311)', () => {
  const lobby = 'a2000000000000000000000000000002';

  it('puts the most people the tab saw in the room on lobby_left', () => {
    lobbyJoined(lobby, { isNewcomer: false });
    lobbyHeadcount(lobby, 3);
    lobbyHeadcount(lobby, 7);
    lobbyHeadcount(lobby, 2);
    lobbyLeft(lobby, 'left');

    expect(events('lobby_left')[0]).toMatchObject({ peak_headcount: 7 });
  });

  it('leaves peak_headcount out when the tab never read the room', () => {
    lobbyJoined(lobby, { isNewcomer: false });
    lobbyLeft(lobby, 'left');
    expect(events('lobby_left')[0]).not.toHaveProperty('peak_headcount');
  });
});

describe('room votes (GEO-3311)', () => {
  const lobby = 'a3000000000000000000000000000003';
  const vote = (id: string, tally = { agree: 0, disagree: 0, eligible: 4 }) => ({
    vote_id: id,
    claim: {
      id: `claim-${id}`,
      space_id: 'space',
      claim_entity_id: `entity-${id}`,
      claim: 'Claim text',
      description: null,
    },
    started_by: null,
    started_at: '2026-10-08T12:00:00Z',
    tally,
  });

  it('reports a started vote with its claim, and its end with the last tally the host saw', () => {
    lobbyJoined(lobby, { isNewcomer: false, role: 'host', hosting: true });
    lobbyRoomVoteStarted(lobby, vote('v1'), { replaced: false });
    lobbyRoomVoteSeen(lobby, vote('v1', { agree: 2, disagree: 1, eligible: 5 }));
    vi.advanceTimersByTime(90_000);
    lobbyRoomVoteSeen(lobby, null);
    // A later read of the same state, and a stale one, end nothing again.
    lobbyRoomVoteSeen(lobby, null);
    lobbyRoomVoteSeen(lobby, vote('v1'));
    lobbyRoomVoteSeen(lobby, null);

    expect(events('lobby_room_vote_started')).toEqual([
      {
        lobby_id: lobby,
        lobby_session_id: expect.any(String),
        room_vote_id: 'v1',
        debate_claim_id: 'claim-v1',
        target_id: 'entity-v1',
        replaced: false,
        eligible: 4,
      },
    ]);
    expect(events('lobby_room_vote_ended')).toEqual([
      {
        lobby_id: lobby,
        lobby_session_id: expect.any(String),
        room_vote_id: 'v1',
        debate_claim_id: 'claim-v1',
        target_id: 'entity-v1',
        agree: 2,
        disagree: 1,
        eligible: 5,
        end_reason: 'ended',
        vote_ms: 90_000,
      },
    ]);
  });

  it('ends a replaced vote before the new one starts, from any host’s tab', () => {
    lobbyRoomVoteSeen(lobby, vote('v1', { agree: 1, disagree: 0, eligible: 3 }));
    lobbyRoomVoteStarted(lobby, vote('v2'), { replaced: true });

    expect(capture.mock.calls.map(([name]) => name)).toEqual(['lobby_room_vote_ended', 'lobby_room_vote_started']);
    expect(events('lobby_room_vote_ended')[0]).toMatchObject({ room_vote_id: 'v1', end_reason: 'replaced', agree: 1 });
    expect(events('lobby_room_vote_started')[0]).toMatchObject({ room_vote_id: 'v2', replaced: true });
  });

  it('ends a running vote as lobby_ended when the host ends the lobby', () => {
    lobbyRoomVoteSeen(lobby, vote('v3'));
    lobbyEnded(lobby, { scheduled: false, opensAt: '2026-10-08T11:00:00Z' });

    expect(events('lobby_room_vote_ended')[0]).toMatchObject({ room_vote_id: 'v3', end_reason: 'lobby_ended' });
  });
});

describe('lobby_ended and lobby_rsvp_changed (GEO-3311)', () => {
  const lobby = 'a4000000000000000000000000000004';

  it('sends how long the lobby was open and the host tab’s headcounts', () => {
    lobbyJoined(lobby, { isNewcomer: false, role: 'host', hosting: true });
    lobbyHeadcount(lobby, 6);
    lobbyHeadcount(lobby, 4);
    lobbyEnded(lobby, { scheduled: true, opensAt: '2026-10-08T11:30:00Z' });

    expect(events('lobby_ended')).toEqual([
      {
        lobby_id: lobby,
        lobby_session_id: expect.any(String),
        scheduled: true,
        open_ms: 30 * 60_000,
        headcount: 4,
        peak_headcount: 6,
      },
    ]);
  });

  it('sends lobby_ended without session fields from a host who was not in the room', () => {
    lobbyEnded(lobby, { scheduled: false, opensAt: 'not a date' });
    expect(events('lobby_ended')).toEqual([{ lobby_id: lobby, scheduled: false }]);
  });

  it('records Going and taking it back, with the count and the time to the start', () => {
    lobbyRsvpChanged(lobby, { going: true, startsAt: '2026-10-09T12:00:00Z', reminderCount: 3 });
    lobbyRsvpChanged(lobby, { going: false, startsAt: '2026-10-09T12:00:00Z', reminderCount: 2 });

    expect(events('lobby_rsvp_changed')).toEqual([
      { lobby_id: lobby, going: true, going_count: 3, ms_until_start: 24 * 60 * 60_000 },
      { lobby_id: lobby, going: false, going_count: 2, ms_until_start: 24 * 60 * 60_000 },
    ]);
  });
});

describe('a reload (GEO-3311)', () => {
  const lobby = 'a5000000000000000000000000000005';

  // A fresh copy of the module over the same sessionStorage, as after a reload.
  const reload = async () => {
    vi.resetModules();
    return import('./lobby-analytics');
  };

  it('still credits the lobby with a debate that starts after the tab reloads', async () => {
    lobbyJoined(lobby, { isNewcomer: true });
    lobbySteppedOut(lobby);

    const reloaded = await reload();
    reloaded.lobbyDebateSeen({ id: 'debate-after-reload', lobby_id: lobby });

    const [joined] = events('lobby_joined');
    expect(events('lobby_debate_started')).toEqual([
      expect.objectContaining({
        lobby_id: lobby,
        lobby_session_id: joined.lobby_session_id,
        debate_id: 'debate-after-reload',
        is_newcomer: true,
      }),
    ]);
    reloaded.resetLobbyAnalytics();
  });

  it('does not count a debate twice across a reload', async () => {
    lobbyJoined(lobby, { isNewcomer: false });
    lobbyDebateSeen({ id: 'debate-before-reload', lobby_id: lobby });

    const reloaded = await reload();
    reloaded.lobbyDebateSeen({ id: 'debate-before-reload', lobby_id: lobby });

    expect(events('lobby_debate_started')).toHaveLength(1);
    expect(events('lobby_left')).toHaveLength(1);
    reloaded.resetLobbyAnalytics();
  });

  it('starts from nothing when storage cannot be read', async () => {
    window.sessionStorage.setItem('geo.lobby-analytics.v1', '{not json');
    const reloaded = await reload();
    reloaded.lobbyDebateSeen({ id: 'debate-unreadable', lobby_id: lobby });
    expect(events('lobby_debate_started')).toEqual([]);
    reloaded.resetLobbyAnalytics();
  });
});
