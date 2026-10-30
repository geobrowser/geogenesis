import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';

import * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DebateLobbyCalendarRow, DebateLobbyMember, DebateLobbySummary, DebateLobbyView } from '../api';
import type { LobbyPresenceRoster } from './hooks';

const api = vi.hoisted(() => ({
  setDebateLobbyPresence: vi.fn(),
  sendDebateLobbyHeartbeat: vi.fn(),
  getDebateLobby: vi.fn(),
  stepOutOfDebateLobby: vi.fn(),
  endDebateLobbyStepOut: vi.fn(),
  listDebateLobbies: vi.fn(),
  listDebateLobbyCalendar: vi.fn(),
  setDebateLobbyReminder: vi.fn(),
  setDebateLobbyDismissal: vi.fn(),
  endDebateLobby: vi.fn(),
}));

const capture = vi.hoisted(() => vi.fn());
vi.mock('~/core/analytics', async importOriginal => ({
  ...(await importOriginal<typeof import('~/core/analytics')>()),
  capture,
}));

vi.mock('../api', async importOriginal => ({ ...(await importOriginal<typeof import('../api')>()), ...api }));

const auth = vi.hoisted(() => ({ authenticated: true, accountKey: 'acct' as string | null }));
vi.mock('../hooks', async importOriginal => ({
  ...(await importOriginal<typeof import('../hooks')>()),
  useGeoChatAuth: () => ({ ready: true, ...auth, getPrivyIdentityToken: vi.fn() }),
}));

const { GeoChatRequestError, GeoChatSessionError } = await import('../api');
const {
  LOBBY_HEARTBEAT_MS,
  SIGNED_OUT_LOBBIES_POLL_MS,
  useDebateLobbies,
  useDebateLobby,
  useDebateLobbyCalendar,
  useDebateLobbyDismissal,
  useDebateLobbyReminder,
  useEndDebateLobby,
  useLobbyDismissalError,
  useLobbyPresence,
  useLobbyReminderSaving,
} = await import('./hooks');
const { applyLobbyCardPatch, applyLobbyCardPatchToCalendar } = await import('./lobby-card-patch');
const { debateQueryKeys } = await import('../hooks');
const { readCarriedLobbyChoice, reportLobbyMic, routeIntoDebate } = await import('./step-out');
const { withLobbyClaimLists } = await import('./lobby-claim-lists-state');
const { consumeDebateReturnDestination } = await import('../debate-return-navigation');
const { lobbyDebateSeen, lobbyRoomVoteSeen, markLobbyEntry, resetLobbyAnalytics } = await import('./lobby-analytics');

const lobbyEvents = (name: string) =>
  capture.mock.calls.filter(([event]) => event === name).map(([, props]) => props as Record<string, unknown>);

/** A presence call that resolves when the test says so. */
function deferredJoin() {
  let resolve: (view: DebateLobbyView) => void = () => undefined;
  api.setDebateLobbyPresence.mockImplementationOnce(() => new Promise<DebateLobbyView>(done => (resolve = done)));
  return (view: DebateLobbyView) => resolve(view);
}

function view(connected: boolean, access: DebateLobbyView['access'] = { status: 'admitted' }): DebateLobbyView {
  return {
    lobby_id: 'lobby1',
    name: 'Hour',
    access,
    starts_at: '2026-10-05T10:00:00Z',
    opens_at: '2026-10-05T10:00:00Z',
    scheduled: false,
    created_by: 'u1',
    acting_host_id: null,
    hosts_changed_at: null,
    reminder_count: 0,
    members: [],
    viewer: {
      role: 'speaker',
      creator: false,
      hosting: false,
      reminded: false,
      voice_away_at: null,
      connected,
      stepped_out: false,
    },
  };
}

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const joins = () => api.setDebateLobbyPresence.mock.calls.filter(([, body]) => body.joined);
const leaves = () => api.setDebateLobbyPresence.mock.calls.filter(([, body]) => !body.joined);

beforeEach(() => {
  api.setDebateLobbyPresence.mockImplementation(async (_id: string, body: { joined: boolean }) => view(body.joined));
  api.sendDebateLobbyHeartbeat.mockResolvedValue({ connection_alive: true, voice_away_at: null });
  api.stepOutOfDebateLobby.mockResolvedValue(view(false));
  api.endDebateLobbyStepOut.mockResolvedValue(view(false));
});

/** Joined, then one heartbeat that says the connection is gone for `reason`. */
async function goneAfterBeat(reason: string, currentLobbyId: string | null = null) {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  api.sendDebateLobbyHeartbeat.mockResolvedValueOnce({
    connection_alive: false,
    voice_away_at: null,
    reason,
    current_lobby_id: currentLobbyId,
  });
  const hook = renderHook(() => useLobbyPresence('lobby1', true), { wrapper });
  await waitFor(() => expect(hook.result.current.state.status).toBe('joined'));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(LOBBY_HEARTBEAT_MS);
  });
  return hook;
}

afterEach(async () => {
  cleanup();
  vi.useRealTimers();
  // Let the leave an unmount queues land before the mocks reset, not in the next test.
  await new Promise(resolve => setTimeout(resolve, 0));
  resetLobbyAnalytics();
  vi.clearAllMocks();
});

describe('useLobbyPresence', () => {
  it('joins once admitted and leaves on unmount', async () => {
    const { result, unmount } = renderHook(() => useLobbyPresence('lobby1', true), { wrapper });

    await waitFor(() => expect(result.current.state.status).toBe('joined'));
    expect(joins()[0]![1]).toMatchObject({ joined: true, leave_other_lobby: false });

    unmount();
    await waitFor(() => expect(leaves()).toHaveLength(1));
    // Sent with keepalive, so it survives navigation.
    expect(leaves()[0]![4]).toBe(true);
  });

  it('does not join a lobby the viewer is not admitted to', async () => {
    renderHook(() => useLobbyPresence('lobby1', false), { wrapper });
    await act(async () => {});
    expect(api.setDebateLobbyPresence).not.toHaveBeenCalled();
  });

  it('asks before leaving another lobby, then joins with leave_other_lobby', async () => {
    api.setDebateLobbyPresence.mockRejectedValueOnce(
      new GeoChatRequestError('you are in another lobby', 'already_in_another_lobby', 409, null, {
        current_lobby_id: '000000000000000000000000000000AB',
      })
    );
    const { result } = renderHook(() => useLobbyPresence('lobby1', true), { wrapper });

    await waitFor(() =>
      expect(result.current.state).toEqual({
        status: 'confirm_leave_other',
        otherLobbyId: '000000000000000000000000000000ab',
      })
    );
    // Waits for the viewer rather than retrying.
    expect(joins()).toHaveLength(1);

    await act(() => result.current.join(true));
    expect(joins()[1]![1]).toMatchObject({ leave_other_lobby: true });
    expect(result.current.state.status).toBe('joined');
  });

  it('heartbeats while joined and joins again when the lease lapsed', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    api.sendDebateLobbyHeartbeat.mockResolvedValueOnce({ connection_alive: false, voice_away_at: null });
    const { result } = renderHook(() => useLobbyPresence('lobby1', true), { wrapper });
    await waitFor(() => expect(result.current.state.status).toBe('joined'));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(LOBBY_HEARTBEAT_MS);
    });

    expect(api.sendDebateLobbyHeartbeat).toHaveBeenCalledWith(
      'lobby1',
      expect.objectContaining({ voice_connected: false }),
      expect.any(Function),
      'acct'
    );
    await waitFor(() => expect(joins()).toHaveLength(2));
  });

  // Another tab joined a different lobby with leave_other_lobby, dropping this tab's lease.
  it('says the viewer moved, without rejoining, on reason moved', async () => {
    const { result } = await goneAfterBeat('moved', '000000000000000000000000000000AB');
    await waitFor(() =>
      expect(result.current.state).toEqual({ status: 'moved', otherLobbyId: '000000000000000000000000000000ab' })
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(LOBBY_HEARTBEAT_MS * 2);
    });
    expect(joins()).toHaveLength(1);
    expect(api.sendDebateLobbyHeartbeat).toHaveBeenCalledTimes(1);
  });

  it('stays stepped out, and sends no leave on unmount, on reason stepped_out', async () => {
    const { result, unmount } = await goneAfterBeat('stepped_out');
    await waitFor(() => expect(result.current.state.status).toBe('stepped_out'));
    unmount();
    await act(async () => {});
    expect(joins()).toHaveLength(1);
    expect(leaves()).toHaveLength(0);
  });

  it('stops on reason ended rather than rejoining', async () => {
    const { result } = await goneAfterBeat('ended');
    await waitFor(() => expect(result.current.state).toEqual({ status: 'dropped', reason: 'ended' }));
    expect(joins()).toHaveLength(1);
  });

  it('ends the room vote a hosting tab was following when the heartbeat says another host ended the lobby', async () => {
    lobbyRoomVoteSeen('lobby1', {
      vote_id: 'vote-at-end',
      claim: { id: 'dc', space_id: 's', claim_entity_id: 'c', claim: 'Claim', description: null },
      started_by: null,
      started_at: '2026-10-05T10:00:00Z',
      tally: { agree: 2, disagree: 1, eligible: 4 },
    });
    const { result } = await goneAfterBeat('ended');
    await waitFor(() => expect(result.current.state).toEqual({ status: 'dropped', reason: 'ended' }));

    expect(lobbyEvents('lobby_room_vote_ended')).toEqual([
      expect.objectContaining({ room_vote_id: 'vote-at-end', end_reason: 'lobby_ended', agree: 2 }),
    ]);
  });

  it('rejoins on reason lapsed', async () => {
    await goneAfterBeat('lapsed');
    await waitFor(() => expect(joins()).toHaveLength(2));
  });

  it('rereads the highlights and In this room after rejoining a lapsed lease, not after a refused one', async () => {
    const lapse = async (client: QueryClient) => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      api.sendDebateLobbyHeartbeat.mockResolvedValueOnce({
        connection_alive: false,
        voice_away_at: null,
        reason: 'lapsed',
        current_lobby_id: null,
      });
      const hook = renderHook(() => useLobbyPresence('lobby1', true), {
        wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
      });
      await waitFor(() => expect(hook.result.current.state.status).toBe('joined'));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(LOBBY_HEARTBEAT_MS);
      });
      await waitFor(() => expect(joins()).toHaveLength(2));
      return hook;
    };
    const rereads = (invalidate: { mock: { calls: unknown[][] } }) =>
      invalidate.mock.calls.map(([filters]) => (filters as { queryKey: unknown[] }).queryKey[3]);

    const rejoined = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidate = vi.spyOn(rejoined, 'invalidateQueries');
    const { unmount } = await lapse(rejoined);
    await waitFor(() =>
      expect(rereads(invalidate)).toEqual(expect.arrayContaining(['lobby-highlights', 'lobby-claims']))
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['debates', 'account', 'acct', 'lobby-highlights', 'lobby1'] });
    unmount();
    await new Promise(resolve => setTimeout(resolve, 0));
    api.setDebateLobbyPresence.mockClear();

    const refused = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const refusedInvalidate = vi.spyOn(refused, 'invalidateQueries');
    api.setDebateLobbyPresence
      .mockImplementationOnce(async () => view(true))
      .mockRejectedValueOnce(new GeoChatRequestError('raw', 'lobby_removed', 409));
    const hook = await lapse(refused);
    await waitFor(() => expect(hook.result.current.state).toEqual({ status: 'dropped', reason: 'removed' }));
    expect(rereads(refusedInvalidate)).not.toContain('lobby-highlights');
    expect(rereads(refusedInvalidate)).not.toContain('lobby-claims');
  });

  // Otherwise the unmount's leave takes the viewer off the roster before the server steps them out.
  it('steps out before routing into a debate, and does not leave on unmount', async () => {
    const { result, unmount } = renderHook(() => useLobbyPresence('lobby1', true), { wrapper });
    await waitFor(() => expect(result.current.state.status).toBe('joined'));

    const go = vi.fn();
    reportLobbyMic(true);
    act(() => routeIntoDebate(go));
    await waitFor(() => expect(go).toHaveBeenCalled());
    expect(readCarriedLobbyChoice()).toEqual({ micOn: true });
    expect(api.stepOutOfDebateLobby).toHaveBeenCalledWith(
      'lobby1',
      { connection_id: expect.any(String) },
      expect.any(Function),
      'acct'
    );
    expect(result.current.state.status).toBe('stepped_out');
    expect(consumeDebateReturnDestination()).toBe('/debate/lobby1');

    unmount();
    await act(async () => {});
    expect(leaves()).toHaveLength(0);
  });

  // GEO-3337: the debate's exit, browser Back or a link: arriving stepped out is coming back.
  it('joins straight away on arriving stepped out, as back from the debate', async () => {
    const { result } = renderHook(() => useLobbyPresence('lobby1', true, true), { wrapper });
    await waitFor(() => expect(result.current.state.status).toBe('joined'));
    expect(joins()).toHaveLength(1);
    expect(lobbyEvents('lobby_joined').map(props => props.entry)).toEqual(['back_after_debate']);
  });

  // A debate started from another tab steps this open page out; it comes back once that is over.
  describe('a page left open while the viewer debates in another tab', () => {
    const me = (inDebate: boolean): DebateLobbyMember => ({
      user_id: 'me',
      profile_space_id: 'space-me',
      display_name: 'Me',
      avatar_cid: null,
      role: 'speaker',
      creator: false,
      acting_host: false,
      on_roster_since: '2026-10-05T10:00:00Z',
      stepped_out: inDebate,
      in_debate: inDebate,
    });
    /** A roster as read from geo-chat: a fresh `members` array, with or without the viewer's row. */
    const read = (own: DebateLobbyMember | null): LobbyPresenceRoster => ({
      members: own ? [own] : [],
      viewerId: 'me',
    });

    function renderOpenPage(initial: LobbyPresenceRoster | undefined) {
      return renderHook(
        ({ roster, removed = false }: { roster: LobbyPresenceRoster | undefined; removed?: boolean }) =>
          useLobbyPresence('lobby1', true, false, false, removed, roster),
        { wrapper, initialProps: { roster: initial } as { roster: LobbyPresenceRoster | undefined; removed?: boolean } }
      );
    }

    async function steppedOutByAnotherTab() {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      api.sendDebateLobbyHeartbeat.mockResolvedValueOnce({
        connection_alive: false,
        voice_away_at: null,
        reason: 'stepped_out',
        current_lobby_id: null,
      });
      const shown = read(me(false));
      const hook = renderOpenPage(shown);
      await waitFor(() => expect(hook.result.current.state.status).toBe('joined'));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(LOBBY_HEARTBEAT_MS);
      });
      await waitFor(() => expect(hook.result.current.state.status).toBe('stepped_out'));
      return { ...hook, shown };
    }

    // `debate.lobby_claim_lists_changed` and `debate.lobby_guests_changed` patch the view, not the roster.
    it('stays out on a patch to the view, whose roster is still the one from before the debate', async () => {
      const { result, rerender, shown } = await steppedOutByAnotherTab();
      rerender({ roster: { members: shown.members, viewerId: 'me' } });
      expect(result.current.state.status).toBe('stepped_out');
      expect(joins()).toHaveLength(1);
    });

    it('stays out while a newer roster shows the debate, and rejoins once one shows it over', async () => {
      const { result, rerender } = await steppedOutByAnotherTab();
      rerender({ roster: read(me(true)) });
      expect(result.current.state.status).toBe('stepped_out');
      expect(joins()).toHaveLength(1);

      rerender({ roster: read(me(false)) });
      await waitFor(() => expect(result.current.state.status).toBe('joined'));
      expect(joins()).toHaveLength(2);
      expect(lobbyEvents('lobby_joined').map(props => props.entry)).toEqual(['link', 'back_after_debate']);
    });

    // The debate can end before this tab sees it running: the first roster after the step-out says over.
    it('rejoins when the debate was over before this tab ever saw it', async () => {
      const { result, rerender } = await steppedOutByAnotherTab();
      rerender({ roster: read(me(false)) });
      await waitFor(() => expect(result.current.state.status).toBe('joined'));
      expect(joins()).toHaveLength(2);
    });

    it('leaves with the viewer, without joining, when a newer roster no longer lists them', async () => {
      const { result, rerender } = await steppedOutByAnotherTab();
      rerender({ roster: read(null) });
      await waitFor(() => expect(result.current.state.status).toBe('left'));
      expect(joins()).toHaveLength(1);
    });

    // The page's removed screen, as for a page still in the room; nothing else would bring it.
    it('takes the removed screen when a host removes the viewer meanwhile', async () => {
      const { result, rerender, shown } = await steppedOutByAnotherTab();
      rerender({ roster: shown, removed: true });
      await waitFor(() => expect(result.current.state).toEqual({ status: 'dropped', reason: 'removed' }));
      expect(joins()).toHaveLength(1);
    });

    it('does not turn a page on its way into its own debate to the removed screen', async () => {
      const shown = read(me(false));
      const { result, rerender } = renderOpenPage(shown);
      await waitFor(() => expect(result.current.state.status).toBe('joined'));
      act(() => routeIntoDebate(vi.fn()));
      await waitFor(() => expect(result.current.state.status).toBe('stepped_out'));

      rerender({ roster: shown, removed: true });
      expect(result.current.state.status).toBe('stepped_out');
    });

    // Structural sharing keeps an equal array across refetches; a read equal to the last still counts.
    it('rejoins on a refetch equal to the roster it was stepped out on, from the real lobby query', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const lobbyView = (connected: boolean): DebateLobbyView => ({ ...view(connected), members: [me(false)] });
      api.getDebateLobby.mockImplementation(async () => lobbyView(false));
      api.setDebateLobbyPresence.mockImplementation(async (_id: string, body: { joined: boolean }) =>
        lobbyView(body.joined)
      );
      api.sendDebateLobbyHeartbeat.mockResolvedValueOnce({
        connection_alive: false,
        voice_away_at: null,
        reason: 'stepped_out',
        current_lobby_id: null,
      });
      // One client across renders, as in the app, so the cache and its sharing are real.
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      const { result } = renderHook(
        () => {
          const members = useDebateLobby('lobby1').data?.members;
          const roster = React.useMemo(() => (members ? { members, viewerId: 'me' } : undefined), [members]);
          return useLobbyPresence('lobby1', true, false, false, false, roster);
        },
        { wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> }
      );
      await waitFor(() => expect(result.current.state.status).toBe('joined'));
      const reads = api.getDebateLobby.mock.calls.length;

      await act(async () => {
        await vi.advanceTimersByTimeAsync(LOBBY_HEARTBEAT_MS);
      });
      // The step-out rereads the lobby, which answers with the same roster: the debate is already over.
      await waitFor(() => expect(api.getDebateLobby.mock.calls.length).toBeGreaterThan(reads));
      await waitFor(() => expect(joins()).toHaveLength(2));
      await waitFor(() => expect(result.current.state.status).toBe('joined'));
    });

    it('waits while it cannot tell whose row is the viewer’s', async () => {
      const { result, rerender } = await steppedOutByAnotherTab();
      rerender({ roster: undefined });
      expect(result.current.state.status).toBe('stepped_out');
      expect(joins()).toHaveLength(1);
    });

    // A scheduled room's debate has not started when the step-out answers, and navigation can lag.
    it('never comes back from a step-out this tab made to go to the debate', async () => {
      const { result, rerender, unmount } = renderOpenPage(read(me(false)));
      await waitFor(() => expect(result.current.state.status).toBe('joined'));
      act(() => routeIntoDebate(vi.fn()));
      await waitFor(() => expect(result.current.state.status).toBe('stepped_out'));

      rerender({ roster: read(me(false)) });
      expect(result.current.state.status).toBe('stepped_out');
      expect(joins()).toHaveLength(1);
      unmount();
      await act(async () => {});
      expect(leaves()).toHaveLength(0);
    });

    it('nor once this tab goes to a debate the server already stepped it out for', async () => {
      const { result, rerender } = await steppedOutByAnotherTab();
      act(() => routeIntoDebate(vi.fn()));
      await act(async () => {});

      rerender({ roster: read(me(false)) });
      expect(result.current.state.status).toBe('stepped_out');
      expect(joins()).toHaveLength(1);
    });
  });

  it('leaves for good on Leave from a page stepped out by another tab', async () => {
    const { result } = await goneAfterBeat('stepped_out');
    await waitFor(() => expect(result.current.state.status).toBe('stepped_out'));

    await act(() => result.current.leaveSteppedOut());
    expect(api.endDebateLobbyStepOut).toHaveBeenCalledTimes(1);
    expect(result.current.state.status).toBe('left');
  });

  // GEO-3134: a kick ends the step-out, and the debate still routes back to the lobby.
  it('does not join a viewer a host removed, even back from a debate, until they choose to', async () => {
    const { result } = renderHook(() => useLobbyPresence('lobby1', true, true, false, true), { wrapper });
    await waitFor(() => expect(result.current.state).toEqual({ status: 'dropped', reason: 'removed' }));
    expect(joins()).toHaveLength(0);

    await act(() => result.current.join(false));
    expect(joins()).toHaveLength(1);
    expect(result.current.state.status).toBe('joined');
  });

  it('still returns to the lobby when the server stepped the viewer out before the routing', async () => {
    const { result } = await goneAfterBeat('stepped_out');
    await waitFor(() => expect(result.current.state.status).toBe('stepped_out'));

    const go = vi.fn();
    // Stands in for the mic the voice reported before the server's step-out unmounted it.
    reportLobbyMic(true);
    act(() => routeIntoDebate(go));
    await waitFor(() => expect(go).toHaveBeenCalled());
    expect(consumeDebateReturnDestination()).toBe('/debate/lobby1');
    expect(readCarriedLobbyChoice()).toEqual({ micOn: true });
    expect(api.stepOutOfDebateLobby).not.toHaveBeenCalled();
  });

  it('returns to the lobby when the server step-out and the routing land in the same tick', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    api.sendDebateLobbyHeartbeat.mockResolvedValueOnce({
      connection_alive: false,
      voice_away_at: null,
      reason: 'stepped_out',
      current_lobby_id: null,
    });
    const { result } = renderHook(() => useLobbyPresence('lobby1', true), { wrapper });
    await waitFor(() => expect(result.current.state.status).toBe('joined'));

    const go = vi.fn();
    // One act, so nothing renders between the heartbeat's answer and the routing.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(LOBBY_HEARTBEAT_MS);
      routeIntoDebate(go);
    });
    await waitFor(() => expect(go).toHaveBeenCalled());
    expect(consumeDebateReturnDestination()).toBe('/debate/lobby1');
    expect(api.stepOutOfDebateLobby).not.toHaveBeenCalled();
  });

  it('does not record the lobby for a viewer who left it', async () => {
    const { result } = renderHook(() => useLobbyPresence('lobby1', true), { wrapper });
    await waitFor(() => expect(result.current.state.status).toBe('joined'));
    await act(() => result.current.leave());

    const go = vi.fn();
    reportLobbyMic(true);
    act(() => routeIntoDebate(go));
    await waitFor(() => expect(go).toHaveBeenCalled());
    expect(consumeDebateReturnDestination()).toBeNull();
    expect(readCarriedLobbyChoice()).toBeNull();
  });

  it('reports voice from the tab that holds it', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { result } = renderHook(() => useLobbyPresence('lobby1', true), { wrapper });
    await waitFor(() => expect(result.current.state.status).toBe('joined'));

    act(() => result.current.setVoiceConnected(true));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(LOBBY_HEARTBEAT_MS);
    });
    expect(api.sendDebateLobbyHeartbeat.mock.calls[0]![1]).toEqual({
      connection_id: result.current.connectionId,
      voice_connected: true,
    });
  });

  // Stepped out by the server from another tab: the view arrives before the next beat.
  it('checks at once when the view says the viewer stepped out', async () => {
    api.sendDebateLobbyHeartbeat.mockResolvedValueOnce({
      connection_alive: false,
      voice_away_at: null,
      reason: 'stepped_out',
    });
    // One client across rerenders, as in the app.
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result, rerender } = renderHook(
      ({ steppedOut, connected }) => useLobbyPresence('lobby1', true, steppedOut, connected),
      {
        wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
        initialProps: { steppedOut: false, connected: false },
      }
    );
    await waitFor(() => expect(result.current.state.status).toBe('joined'));
    rerender({ steppedOut: false, connected: true });
    expect(api.sendDebateLobbyHeartbeat).not.toHaveBeenCalled();

    rerender({ steppedOut: true, connected: false });
    await waitFor(() => expect(result.current.state.status).toBe('stepped_out'));
    expect(api.sendDebateLobbyHeartbeat).toHaveBeenCalledTimes(1);
  });

  // A join answered after Leave must not put the viewer back.
  it('keeps Leave when the join it raced resolves afterwards', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const resolveJoin = deferredJoin();
    const { result } = renderHook(() => useLobbyPresence('lobby1', true), { wrapper });
    await waitFor(() => expect(result.current.state.status).toBe('joining'));

    const leaving = result.current.leave();
    resolveJoin(view(true));
    await act(() => leaving);

    expect(result.current.state.status).toBe('left');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(LOBBY_HEARTBEAT_MS * 2);
    });
    expect(api.sendDebateLobbyHeartbeat).not.toHaveBeenCalled();
    expect(joins()).toHaveLength(1);
    expect(leaves()).toHaveLength(1);
  });

  // Otherwise the server keeps the viewer present and the next lobby answers 409.
  it('sends the leave when unmounted with a join in flight', async () => {
    const resolveJoin = deferredJoin();
    const { result, unmount } = renderHook(() => useLobbyPresence('lobby1', true), { wrapper });
    await waitFor(() => expect(result.current.state.status).toBe('joining'));

    unmount();
    resolveJoin(view(true));
    await waitFor(() => expect(leaves()).toHaveLength(1));
  });

  // Chrome throttles a long-hidden tab's timers; returning beats at once, but not on every quick
  // tab switch, which would run into the 30-a-minute heartbeat limit.
  it('heartbeats when a tab returns after a long gap, not on a quick switch', async () => {
    const { result } = renderHook(() => useLobbyPresence('lobby1', true), { wrapper });
    await waitFor(() => expect(result.current.state.status).toBe('joined'));
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');

    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(api.sendDebateLobbyHeartbeat).not.toHaveBeenCalled();

    // A throttled tab: the clock moved on, the interval did not fire.
    const now = Date.now();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now + 31_000);
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    await waitFor(() => expect(api.sendDebateLobbyHeartbeat).toHaveBeenCalledTimes(1));

    clock.mockRestore();
    visibility.mockRestore();
  });

  // geo-chat: a heartbeat 429 waits out Retry-After; a rejoin would be limited too.
  it('backs off a rate-limited heartbeat without rejoining', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    api.sendDebateLobbyHeartbeat.mockRejectedValueOnce(
      new GeoChatRequestError('slow down', 'rate_limited', 429, 2_000)
    );
    const { result } = renderHook(() => useLobbyPresence('lobby1', true), { wrapper });
    await waitFor(() => expect(result.current.state.status).toBe('joined'));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(LOBBY_HEARTBEAT_MS);
    });
    expect(api.sendDebateLobbyHeartbeat).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    expect(api.sendDebateLobbyHeartbeat).toHaveBeenCalledTimes(2);
    expect(joins()).toHaveLength(1);
  });

  it('retries an automatic join once after Retry-After', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    api.setDebateLobbyPresence.mockRejectedValueOnce(new GeoChatRequestError('slow down', 'rate_limited', 429, 1_000));
    const { result } = renderHook(() => useLobbyPresence('lobby1', true), { wrapper });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    await waitFor(() => expect(result.current.state.status).toBe('joined'));
    expect(joins()).toHaveLength(2);
  });

  it('stays out after Leave', async () => {
    const { result, unmount } = renderHook(() => useLobbyPresence('lobby1', true), { wrapper });
    await waitFor(() => expect(result.current.state.status).toBe('joined'));

    await act(() => result.current.leave());
    expect(result.current.state.status).toBe('left');
    expect(leaves()).toHaveLength(1);

    unmount();
    await act(async () => {});
    // No second leave, and no rejoin.
    expect(leaves()).toHaveLength(1);
    expect(joins()).toHaveLength(1);
  });
});

describe('useDebateLobby', () => {
  // `debate.lobby_changed` only reaches present members, so nobody would tell this page.
  it('refetches a lobby that is not yet open when it opens', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const opensAt = new Date(Date.now() + 60_000).toISOString();
    api.getDebateLobby
      .mockResolvedValueOnce(view(false, { status: 'not_yet_open', opens_at: opensAt }))
      .mockResolvedValue(view(false));
    const { result } = renderHook(() => useDebateLobby('lobby1'), { wrapper });
    await waitFor(() => expect(result.current.data?.access.status).toBe('not_yet_open'));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(61_000);
    });
    await waitFor(() => expect(result.current.data?.access.status).toBe('admitted'));
    expect(api.getDebateLobby).toHaveBeenCalledTimes(2);
  });

  // Nothing else refetches this page, so one failed refetch at opens_at must not end the retries.
  it('tries again after the refetch at opens_at fails', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const opensAt = new Date(Date.now() + 60_000).toISOString();
    api.getDebateLobby
      .mockResolvedValueOnce(view(false, { status: 'not_yet_open', opens_at: opensAt }))
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValue(view(false));
    const { result } = renderHook(() => useDebateLobby('lobby1'), { wrapper });
    await waitFor(() => expect(result.current.data?.access.status).toBe('not_yet_open'));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(61_000);
    });
    await waitFor(() => expect(api.getDebateLobby).toHaveBeenCalledTimes(2));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6_000);
    });
    await waitFor(() => expect(result.current.data?.access.status).toBe('admitted'));
  });

  it('reads a held call every 3 minutes, not at its passed opens_at', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const held = {
      ...view(false, { status: 'not_yet_open', opens_at: new Date(Date.now() - 60_000).toISOString() }),
      call: { space_id: 's1', space_name: null, started_by: null, status: 'scheduled' as const, held: true },
    };
    api.getDebateLobby.mockResolvedValue(held);
    renderHook(() => useDebateLobby('lobby1'), { wrapper });
    await waitFor(() => expect(api.getDebateLobby).toHaveBeenCalledTimes(1));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(170_000);
    });
    expect(api.getDebateLobby).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(11_000);
    });
    await waitFor(() => expect(api.getDebateLobby).toHaveBeenCalledTimes(2));
  });
});

describe('useDebateLobby and claim lists (GEO-3274)', () => {
  // A refetch that read the lobby before a list event landed must not put the older lists back.
  it('keeps lists an event laid over the cache while its GET was in flight', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const key = ['debates', 'account', 'acct', 'lobby', 'lobby1'];
    const list = (entityId: string) => ({
      entity_id: entityId,
      space_id: 's1',
      position: 0,
      added_by: null,
      added_at: '2026-10-13T12:00:00Z',
    });
    client.setQueryData(key, { ...view(false), claim_lists: [], claim_lists_as_of: '2026-10-13T12:00:01Z' });
    let respond: (value: DebateLobbyView) => void = () => undefined;
    api.getDebateLobby.mockImplementationOnce(() => new Promise<DebateLobbyView>(done => (respond = done)));

    const { result } = renderHook(() => useDebateLobby('lobby1'), {
      wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
    });
    await waitFor(() => expect(api.getDebateLobby).toHaveBeenCalledTimes(1));

    // The event, as the gateway lays it over the cache.
    act(() => {
      client.setQueryData<DebateLobbyView>(key, current =>
        current
          ? withLobbyClaimLists(current, {
              lobby_id: 'lobby1',
              as_of: '2026-10-13T12:00:03Z',
              claim_lists: [list('newer')],
            })
          : current
      );
    });
    // The GET read the lobby in between: newer than the cache it started on, older than the event.
    await act(async () => {
      respond({ ...view(false), claim_lists: [list('older')], claim_lists_as_of: '2026-10-13T12:00:02Z' });
    });

    await waitFor(() => expect(result.current.isFetching).toBe(false));
    expect(result.current.data?.claim_lists?.map(row => row.entity_id)).toEqual(['newer']);
  });
});

// GEO-3134: geo-chat refuses a removed member's join with 409 lobby_removed unless it says `rejoin`.
describe('useLobbyPresence after a host removed the viewer', () => {
  const removed = () => new GeoChatRequestError('raw', 'lobby_removed', 409);
  const lastJoinBody = () => joins().at(-1)?.[1];

  it('lands an automatic join on the removed screen, without retrying', async () => {
    api.setDebateLobbyPresence.mockRejectedValueOnce(removed());
    const { result } = renderHook(() => useLobbyPresence('lobby1', true), { wrapper });
    await waitFor(() => expect(result.current.state).toEqual({ status: 'dropped', reason: 'removed' }));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(joins()).toHaveLength(1);
    expect(lastJoinBody()).not.toHaveProperty('rejoin');
  });

  it('does the same on arriving back from a debate', async () => {
    api.setDebateLobbyPresence.mockRejectedValueOnce(removed());
    const { result } = renderHook(() => useLobbyPresence('lobby1', true, true), { wrapper });
    await waitFor(() => expect(result.current.state).toEqual({ status: 'dropped', reason: 'removed' }));
    expect(lastJoinBody()).not.toHaveProperty('rejoin');
  });

  it('does the same on a lapsed lease’s rejoin', async () => {
    api.setDebateLobbyPresence.mockImplementationOnce(async () => view(true)).mockRejectedValueOnce(removed());
    const { result } = await goneAfterBeat('lapsed');
    await waitFor(() => expect(result.current.state).toEqual({ status: 'dropped', reason: 'removed' }));
    expect(joins()).toHaveLength(2);
  });

  it('does the same on a back-forward cache restore', async () => {
    const { result } = renderHook(() => useLobbyPresence('lobby1', true), { wrapper });
    await waitFor(() => expect(result.current.state.status).toBe('joined'));
    api.setDebateLobbyPresence.mockRejectedValueOnce(removed());
    act(() => {
      window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }));
    });
    await waitFor(() => expect(result.current.state).toEqual({ status: 'dropped', reason: 'removed' }));
  });

  it('sends rejoin only from the removed screen’s Rejoin, and keeps it through leaving another lobby', async () => {
    api.setDebateLobbyPresence.mockRejectedValueOnce(removed());
    const { result } = renderHook(() => useLobbyPresence('lobby1', true), { wrapper });
    await waitFor(() => expect(result.current.state.status).toBe('dropped'));

    api.setDebateLobbyPresence.mockRejectedValueOnce(
      new GeoChatRequestError('raw', 'already_in_another_lobby', 409, null, { current_lobby_id: 'other' })
    );
    await act(() => result.current.join(false, true));
    expect(lastJoinBody()).toMatchObject({ joined: true, rejoin: true });
    expect(result.current.state).toMatchObject({ status: 'confirm_leave_other', rejoin: true });

    await act(() => result.current.join(true, true));
    expect(lastJoinBody()).toMatchObject({ leave_other_lobby: true, rejoin: true });
    expect(result.current.state.status).toBe('joined');
  });
});

// GEO-3134: an unban sends the target `debate.lobby_changed`; the refetch is admitted with `removed`.
it('moves a ban this tab heard to the removed screen once unbanned, and Rejoin comes back', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  api.sendDebateLobbyHeartbeat.mockResolvedValueOnce({
    connection_alive: false,
    voice_away_at: null,
    reason: 'banned',
    current_lobby_id: null,
  });
  const { result, rerender } = renderHook(
    ({ admitted, removed }) => useLobbyPresence('lobby1', admitted, false, false, removed),
    { wrapper, initialProps: { admitted: true, removed: false } }
  );
  await waitFor(() => expect(result.current.state.status).toBe('joined'));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(LOBBY_HEARTBEAT_MS);
  });
  await waitFor(() => expect(result.current.state).toEqual({ status: 'dropped', reason: 'banned' }));

  // The refetch while banned: access banned, so not admitted.
  rerender({ admitted: false, removed: true });
  expect(result.current.state).toEqual({ status: 'dropped', reason: 'banned' });

  // Unbanned.
  rerender({ admitted: true, removed: true });
  await waitFor(() => expect(result.current.state).toEqual({ status: 'dropped', reason: 'removed' }));
  expect(joins()).toHaveLength(1);

  await act(() => result.current.join(false, true));
  expect(joins().at(-1)?.[1]).toMatchObject({ joined: true, rejoin: true });
  expect(result.current.state.status).toBe('joined');
});

// Copilot on #2836 asked for the list to be hidden once signed out. The key carries the account,
// which Privy clears with the session, so a signed-out read is a different entry: since GEO-3289
// the anonymous list, never the account's.
it('drops the account’s lobbies once the viewer signs out, for the anonymous list', async () => {
  api.listDebateLobbies.mockImplementation(async (_token: unknown, accountKey: string | null) => ({
    lobbies: [{ lobby_id: accountKey ? 'members-view' : 'anonymous-view' }],
  }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );

  try {
    const { result, rerender } = renderHook(() => useDebateLobbies(), { wrapper });
    await waitFor(() => expect(result.current.data?.lobbies[0]?.lobby_id).toBe('members-view'));

    Object.assign(auth, { authenticated: false, accountKey: null });
    rerender();
    expect(result.current.data).toBeUndefined();
    await waitFor(() => expect(result.current.data?.lobbies[0]?.lobby_id).toBe('anonymous-view'));
  } finally {
    Object.assign(auth, { authenticated: true, accountKey: 'acct' });
    api.listDebateLobbies.mockReset();
  }
});

// Copilot on #2863: a brand-new account is refused for a minute or two. The list waits that out
// like the account's other reads, so the navbar and a queued reminder do not sit on a failed read.
it('waits out a new account’s warm-up signed in, and reads once signed out', async () => {
  const warmingUp = new GeoChatSessionError(new GeoChatRequestError('Unauthorized', null, 401));
  api.listDebateLobbies.mockRejectedValueOnce(warmingUp).mockResolvedValueOnce({ lobbies: [] });
  const client = new QueryClient();
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );

  try {
    const signedIn = renderHook(() => useDebateLobbies(), { wrapper });
    await waitFor(() => expect(signedIn.result.current.isSuccess).toBe(true), { timeout: 3_000 });
    expect(api.listDebateLobbies).toHaveBeenCalledTimes(2);
    signedIn.unmount();

    api.listDebateLobbies.mockReset().mockRejectedValue(new GeoChatRequestError('down', 'unavailable', 503));
    Object.assign(auth, { authenticated: false, accountKey: null });
    const signedOut = renderHook(() => useDebateLobbies(), { wrapper });
    await waitFor(() => expect(signedOut.result.current.isError).toBe(true));
    expect(api.listDebateLobbies).toHaveBeenCalledTimes(1);
  } finally {
    Object.assign(auth, { authenticated: true, accountKey: 'acct' });
    api.listDebateLobbies.mockReset();
  }
});

// Copilot on #2863: a reminder saving through one control (the navbar's replay) shows as saving on
// every control for that lobby, so none can take it back while the write is still landing.
it('shows a reminder saving in one control as saving in every control for that lobby', async () => {
  let settle: (view: unknown) => void = () => undefined;
  api.setDebateLobbyReminder.mockImplementationOnce(() => new Promise(done => (settle = done)));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );

  const { result } = renderHook(
    () => ({
      replay: useDebateLobbyReminder(),
      panel: useLobbyReminderSaving('abc-123'),
      other: useLobbyReminderSaving('zzz'),
    }),
    { wrapper }
  );
  expect(result.current.panel).toBe(false);

  act(() => result.current.replay.mutate({ lobbyId: 'abc123', reminded: true }));
  await waitFor(() => expect(result.current.panel).toBe(true));
  expect(result.current.other).toBe(false);

  await act(async () => settle(view(false)));
  await waitFor(() => expect(result.current.panel).toBe(false));
});

// Copilot on #2863: the button reads the list's row, so a saved reminder is written there at once
// rather than waiting on the refetch, which may be slow or fail.
it('writes a saved reminder into the cached list and calendar rows without waiting for a refetch', async () => {
  const row = { lobby_id: 'lobby1', open: false, viewer_reminded: false, reminder_count: 0 };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(debateQueryKeys.lobbies('acct'), { lobbies: [row, { ...row, lobby_id: 'other' }] });
  client.setQueryData(debateQueryKeys.lobbyCalendar('acct', 1, 2), { lobbies: [{ ...row, state: 'upcoming' }] });
  api.listDebateLobbies.mockRejectedValue(new GeoChatRequestError('down', 'unavailable', 503));
  api.listDebateLobbyCalendar.mockReturnValue(new Promise(() => undefined));
  const saved = { ...view(false), reminder_count: 4, viewer: { ...view(false).viewer, reminded: true } };
  api.setDebateLobbyReminder.mockResolvedValueOnce(saved);
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );

  try {
    const { result } = renderHook(() => useDebateLobbyReminder(), { wrapper });
    await act(() => result.current.mutateAsync({ lobbyId: 'lobby1', reminded: true }));

    const list = client.getQueryData<{ lobbies: (typeof row)[] }>(debateQueryKeys.lobbies('acct'));
    expect(list?.lobbies[0]).toMatchObject({ viewer_reminded: true, reminder_count: 4 });
    expect(list?.lobbies[1]).toMatchObject({ viewer_reminded: false, reminder_count: 0 });
    const week = client.getQueryData<{ lobbies: (typeof row)[] }>(debateQueryKeys.lobbyCalendar('acct', 1, 2));
    expect(week?.lobbies[0]).toMatchObject({ viewer_reminded: true, reminder_count: 4, state: 'upcoming' });
  } finally {
    api.listDebateLobbies.mockReset();
    api.listDebateLobbyCalendar.mockReset();
  }
});

// GEO-3519. Dismiss takes the row out of the timeline on the press, list and calendar week alike,
// and puts only that row back if the write fails.
describe('useDebateLobbyDismissal', () => {
  const row: DebateLobbySummary = {
    lobby_id: 'lobby1',
    name: 'Hour',
    scheduled: true,
    starts_at: '2026-10-05T10:00:00Z',
    opens_at: '2026-10-05T10:00:00Z',
    open: false,
    hosts: [],
    headcount: 0,
    avatars: [],
    debating_count: 0,
    reminder_count: 0,
    viewer_reminded: false,
    viewer_dismissed: false,
    viewer_on_roster: false,
    as_of: '2026-10-05T09:00:00Z',
  };
  type Rows = { lobbies: DebateLobbySummary[] };
  type Week = { lobbies: DebateLobbyCalendarRow[] };

  function setup() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(debateQueryKeys.lobbies('acct'), { lobbies: [row, { ...row, lobby_id: 'other' }] });
    client.setQueryData(debateQueryKeys.lobbyCalendar('acct', 1, 2), {
      lobbies: [{ ...row, state: 'upcoming', closed_at: null }],
    });
    // The refetch a settled write starts; never landing, so what is read below is the cache's own.
    api.listDebateLobbies.mockReturnValue(new Promise(() => undefined));
    api.listDebateLobbyCalendar.mockReturnValue(new Promise(() => undefined));
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const list = () => client.getQueryData<Rows>(debateQueryKeys.lobbies('acct'))?.lobbies;
    const week = () => client.getQueryData<Week>(debateQueryKeys.lobbyCalendar('acct', 1, 2))?.lobbies;
    return { client, wrapper, list, week };
  }

  /** A dismissal write that settles when the test says so. */
  function deferredDismissal() {
    const write = { settle: (_view: DebateLobbyView) => undefined as void, fail: (_error: Error) => undefined as void };
    api.setDebateLobbyDismissal.mockImplementationOnce(
      () =>
        new Promise<DebateLobbyView>((resolve, reject) => {
          write.settle = resolve;
          write.fail = reject;
        })
    );
    return write;
  }

  afterEach(() => {
    api.listDebateLobbies.mockReset();
    api.listDebateLobbyCalendar.mockReset();
    api.setDebateLobbyDismissal.mockReset();
  });

  it('dismisses through geo-chat, drawn at once, before the write lands', async () => {
    const write = deferredDismissal();
    const { wrapper, list, week } = setup();
    const { result } = renderHook(() => useDebateLobbyDismissal(), { wrapper });

    act(() => result.current.mutate({ lobbyId: 'lobby1', dismissed: true }));

    await waitFor(() => expect(list()?.[0]).toMatchObject({ viewer_dismissed: true }));
    expect(list()?.[1]).toMatchObject({ viewer_dismissed: false });
    expect(week()?.[0]).toMatchObject({ viewer_dismissed: true, state: 'upcoming' });
    expect(api.setDebateLobbyDismissal).toHaveBeenCalledWith('lobby1', true, expect.anything(), 'acct');

    await act(async () => write.settle(view(false)));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(list()?.[0]).toMatchObject({ viewer_dismissed: true });
  });

  // The patch is laid with the gateway's own helpers, so a patch that dropped the dismissal would
  // show here, on the list and on the week, while the write is out.
  it('puts the row back when the write fails, keeping a card patch that landed meanwhile', async () => {
    const write = deferredDismissal();
    const { client, wrapper, list, week } = setup();
    const { result } = renderHook(() => useDebateLobbyDismissal(), { wrapper });

    act(() => result.current.mutate({ lobbyId: 'lobby1', dismissed: true }));
    await waitFor(() => expect(list()?.[0]).toMatchObject({ viewer_dismissed: true }));
    // Someone else's RSVP, broadcast as the lobby's card.
    const {
      viewer_reminded: _reminded,
      viewer_dismissed: _dismissed,
      viewer_on_roster: _onRoster,
      as_of: _asOf,
      ...card
    } = row;
    const patch = { asOf: '2026-10-05T09:30:00Z', lobby: { ...card, reminder_count: 7 } };
    act(() => {
      client.setQueryData<Rows>(debateQueryKeys.lobbies('acct'), old => old && applyLobbyCardPatch(old, patch));
      client.setQueryData<Week>(
        debateQueryKeys.lobbyCalendar('acct', 1, 2),
        old => old && applyLobbyCardPatchToCalendar(old, patch)
      );
    });
    expect(list()?.find(r => r.lobby_id === 'lobby1')).toMatchObject({ viewer_dismissed: true, reminder_count: 7 });
    expect(week()?.[0]).toMatchObject({ viewer_dismissed: true, reminder_count: 7 });

    await act(async () => write.fail(new GeoChatRequestError('down', 'unavailable', 503)));

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(list()?.find(r => r.lobby_id === 'lobby1')).toMatchObject({ viewer_dismissed: false, reminder_count: 7 });
    expect(week()?.[0]).toMatchObject({ viewer_dismissed: false, reminder_count: 7 });
  });

  // The write cancels reads on their way, which would land the old row over the drawn one. A failed
  // write must not leave them cancelled for good.
  it('reads the list again after a failed write that cancelled its read', async () => {
    const { wrapper } = setup();
    const write = deferredDismissal();
    const { result } = renderHook(() => ({ list: useDebateLobbies(), dismissal: useDebateLobbyDismissal() }), {
      wrapper,
    });
    await waitFor(() => expect(api.listDebateLobbies).toHaveBeenCalledTimes(1));
    expect(result.current.list.isFetching).toBe(true);

    act(() => result.current.dismissal.mutate({ lobbyId: 'lobby1', dismissed: true }));
    await waitFor(() => expect(result.current.list.isFetching).toBe(false));

    await act(async () => write.fail(new GeoChatRequestError('down', 'unavailable', 503)));

    await waitFor(() => expect(api.listDebateLobbies).toHaveBeenCalledTimes(2));
  });

  // The panel holds one mutation for every row, so its own error follows only its last call.
  it('says each lobby’s own failure, whichever was dismissed last', async () => {
    const first = deferredDismissal();
    const second = deferredDismissal();
    const { wrapper } = setup();
    const { result } = renderHook(
      () => ({
        dismissal: useDebateLobbyDismissal(),
        first: useLobbyDismissalError('lobby1'),
        second: useLobbyDismissalError('other'),
      }),
      { wrapper }
    );

    act(() => result.current.dismissal.mutate({ lobbyId: 'lobby1', dismissed: true }));
    act(() => result.current.dismissal.mutate({ lobbyId: 'other', dismissed: true }));
    await waitFor(() => expect(api.setDebateLobbyDismissal).toHaveBeenCalledTimes(2));
    const failure = new GeoChatRequestError('down', 'unavailable', 503);
    await act(async () => {
      first.fail(failure);
      second.settle({ ...view(false), lobby_id: 'other' });
    });

    await waitFor(() => expect(result.current.first).toBe(failure));
    expect(result.current.second).toBeNull();
  });

  // geo-chat clears a dismissal on RSVP; the cached row follows without waiting for a refetch.
  it('is cleared by an RSVP', async () => {
    const { client, wrapper, list } = setup();
    client.setQueryData<Rows>(debateQueryKeys.lobbies('acct'), { lobbies: [{ ...row, viewer_dismissed: true }] });
    api.setDebateLobbyReminder.mockResolvedValueOnce({
      ...view(false),
      viewer: { ...view(false).viewer, reminded: true, dismissed: false },
    });
    const { result } = renderHook(() => useDebateLobbyReminder(), { wrapper });

    await act(() => result.current.mutateAsync({ lobbyId: 'lobby1', reminded: true }));

    expect(list()?.[0]).toMatchObject({ viewer_reminded: true, viewer_dismissed: false });
  });

  // One rule for both writes: the row takes geo-chat's word, whichever way the reminder went.
  it('takes the dismissal from geo-chat’s answer to a reminder, whichever way it went', async () => {
    const { client, wrapper, list } = setup();
    client.setQueryData<Rows>(debateQueryKeys.lobbies('acct'), { lobbies: [{ ...row, viewer_dismissed: true }] });
    api.setDebateLobbyReminder.mockResolvedValueOnce({
      ...view(false),
      viewer: { ...view(false).viewer, reminded: false, dismissed: false },
    });
    const { result } = renderHook(() => useDebateLobbyReminder(), { wrapper });

    await act(() => result.current.mutateAsync({ lobbyId: 'lobby1', reminded: false }));
    expect(list()?.[0]).toMatchObject({ viewer_reminded: false, viewer_dismissed: false });
  });
});

// GEO-3289. Signed out there is no gateway scope to patch the list, so it is polled.
it('lists lobbies to a signed-out visitor and polls, and only then', async () => {
  api.listDebateLobbies.mockResolvedValue({ lobbies: [] });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const interval = (accountKey: string | null) =>
    client.getQueryCache().find({ queryKey: debateQueryKeys.lobbies(accountKey) })?.observers[0]?.options
      .refetchInterval;

  try {
    Object.assign(auth, { authenticated: false, accountKey: null });
    const signedOut = renderHook(() => useDebateLobbies(), { wrapper });
    await waitFor(() => expect(signedOut.result.current.isSuccess).toBe(true));
    expect(api.listDebateLobbies).toHaveBeenCalledWith(expect.anything(), null, expect.anything());
    expect(interval(null)).toBe(SIGNED_OUT_LOBBIES_POLL_MS);
    signedOut.unmount();

    Object.assign(auth, { authenticated: true, accountKey: 'acct' });
    const signedIn = renderHook(() => useDebateLobbies(), { wrapper });
    await waitFor(() => expect(signedIn.result.current.isSuccess).toBe(true));
    expect(interval('acct')).toBeFalsy();
  } finally {
    Object.assign(auth, { authenticated: true, accountKey: 'acct' });
    api.listDebateLobbies.mockReset();
  }
});

// GEO-3300. The calendar's week sits under the list's key, so whatever refetches the list (a
// lobby created, opened or closed, an RSVP, a reconnect) refetches the week too.
it('reads the calendar week for its bounds, and again whenever the lobby list is refetched', async () => {
  api.listDebateLobbyCalendar.mockResolvedValue({ lobbies: [] });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const from = new Date('2026-10-11T07:00:00Z');
  const to = new Date('2026-10-18T07:00:00Z');

  const { result } = renderHook(() => useDebateLobbyCalendar(from, to), { wrapper });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(api.listDebateLobbyCalendar).toHaveBeenCalledWith({ from, to }, expect.anything(), 'acct', expect.anything());

  await client.invalidateQueries({ queryKey: debateQueryKeys.lobbies('acct') });
  await waitFor(() => expect(api.listDebateLobbyCalendar).toHaveBeenCalledTimes(2));
});

// GEO-3519. The Requests timeline's range moves on at midnight; its rows stay while the new one loads,
// where the calendar's own weeks start empty.
it.each([
  [true, ['day-one']],
  [false, undefined],
])('with keepPreviousRange %s, draws the last range while the next loads: %j', async (keepPreviousRange, drawn) => {
  api.listDebateLobbyCalendar.mockResolvedValueOnce({ lobbies: [{ lobby_id: 'day-one' }] });
  api.listDebateLobbyCalendar.mockReturnValueOnce(new Promise(() => undefined));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const day = (date: number) => new Date(2026, 9, date);

  try {
    const { result, rerender } = renderHook(
      ({ from }: { from: Date }) => useDebateLobbyCalendar(from, day(from.getDate() + 7), true, { keepPreviousRange }),
      { wrapper, initialProps: { from: day(28) } }
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    rerender({ from: day(29) });
    await waitFor(() => expect(api.listDebateLobbyCalendar).toHaveBeenCalledTimes(2));

    expect(result.current.data?.lobbies.map(lobby => lobby.lobby_id)).toEqual(drawn);
    expect(result.current.isLoading).toBe(!keepPreviousRange);
  } finally {
    api.listDebateLobbyCalendar.mockReset();
  }
});

// GEO-3517. The debate hours page reads the week signed out; the Calendar still waits for an account.
it('reads the calendar week signed out only when asked to, and then polls it as the list is', async () => {
  api.listDebateLobbyCalendar.mockResolvedValue({ lobbies: [] });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const from = new Date('2026-10-11T07:00:00Z');
  const to = new Date('2026-10-18T07:00:00Z');
  try {
    Object.assign(auth, { authenticated: false, accountKey: null });
    const calendarPage = renderHook(() => useDebateLobbyCalendar(from, to), { wrapper });
    expect(calendarPage.result.current.fetchStatus).toBe('idle');
    expect(api.listDebateLobbyCalendar).not.toHaveBeenCalled();

    const hoursPage = renderHook(() => useDebateLobbyCalendar(from, to, true, { signedOut: true }), { wrapper });
    await waitFor(() => expect(hoursPage.result.current.isSuccess).toBe(true));
    expect(api.listDebateLobbyCalendar).toHaveBeenCalledWith({ from, to }, expect.anything(), null, expect.anything());
    const query = client
      .getQueryCache()
      .find({ queryKey: debateQueryKeys.lobbyCalendar(null, from.getTime(), to.getTime()) });
    expect((query?.observers[0]?.options as { refetchInterval?: number }).refetchInterval).toBe(
      SIGNED_OUT_LOBBIES_POLL_MS
    );
  } finally {
    Object.assign(auth, { authenticated: true, accountKey: 'acct' });
    api.listDebateLobbyCalendar.mockReset();
  }
});

// Card patches stop while the panel is closed, so a reopen inside the stale window still reloads.
it('reloads the lobbies list on every mount', async () => {
  api.listDebateLobbies.mockResolvedValue({ lobbies: [] });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } });
  const shared = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );

  const first = renderHook(() => useDebateLobbies(), { wrapper: shared });
  await waitFor(() => expect(first.result.current.isSuccess).toBe(true));
  first.unmount();

  renderHook(() => useDebateLobbies(), { wrapper: shared });
  await waitFor(() => expect(api.listDebateLobbies).toHaveBeenCalledTimes(2));
});

it('with a staleTime, reloads the lobbies list on mount only once it is that old', async () => {
  api.listDebateLobbies.mockResolvedValue({ lobbies: [] });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const shared = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const useListed = () => useDebateLobbies(true, { staleTime: 60_000 });

  const first = renderHook(useListed, { wrapper: shared });
  await waitFor(() => expect(first.result.current.isSuccess).toBe(true));
  first.unmount();
  const second = renderHook(useListed, { wrapper: shared });
  expect(second.result.current.isSuccess).toBe(true);
  second.unmount();
  expect(api.listDebateLobbies).toHaveBeenCalledTimes(1);

  const now = Date.now();
  const spy = vi.spyOn(Date, 'now').mockReturnValue(now + 61_000);
  renderHook(useListed, { wrapper: shared });
  await waitFor(() => expect(api.listDebateLobbies).toHaveBeenCalledTimes(2));
  spy.mockRestore();
});

describe('lobby analytics through useLobbyPresence', () => {
  function strictWrapper({ children }: { children: React.ReactNode }) {
    return <React.StrictMode>{wrapper({ children })}</React.StrictMode>;
  }

  it('sends one lobby_joined under StrictMode, with the marked entry and the newcomer flag', async () => {
    api.setDebateLobbyPresence.mockImplementation(async (_id: string, body: { joined: boolean }) => {
      const next = view(body.joined);
      return { ...next, viewer: { ...next.viewer, newcomer: true } };
    });
    markLobbyEntry('lobby1', 'side_panel');
    const { result } = renderHook(() => useLobbyPresence('lobby1', true), { wrapper: strictWrapper });
    await waitFor(() => expect(result.current.state.status).toBe('joined'));
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(lobbyEvents('lobby_joined')).toEqual([
      {
        lobby_id: 'lobby1',
        lobby_session_id: expect.any(String),
        is_newcomer: true,
        role: 'speaker',
        hosting: false,
        entry: 'side_panel',
      },
    ]);
    expect(lobbyEvents('lobby_left')).toEqual([]);
  });

  it('keeps the session through a lapsed lease', async () => {
    await goneAfterBeat('lapsed');
    await waitFor(() => expect(joins()).toHaveLength(2));
    expect(lobbyEvents('lobby_joined')).toHaveLength(1);
  });

  it('sends lobby_left once for Leave, and a Rejoin starts a new session', async () => {
    const { result, unmount } = renderHook(() => useLobbyPresence('lobby1', true), { wrapper });
    await waitFor(() => expect(result.current.state.status).toBe('joined'));
    await act(() => result.current.leave());
    await act(() => result.current.join(false));
    await waitFor(() => expect(result.current.state.status).toBe('joined'));
    unmount();
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(lobbyEvents('lobby_joined').map(props => props.entry)).toEqual(['link', 'rejoin']);
    expect(lobbyEvents('lobby_left').map(props => props.exit)).toEqual(['left', 'left']);
  });

  it('ends the session as lobby_ended when the host ends it', async () => {
    await goneAfterBeat('ended');
    await waitFor(() => expect(lobbyEvents('lobby_left').map(props => props.exit)).toEqual(['lobby_ended']));
  });

  it('attributes the debate after this tab steps out into it', async () => {
    const { result, unmount } = renderHook(() => useLobbyPresence('lobby1', true), { wrapper });
    await waitFor(() => expect(result.current.state.status).toBe('joined'));
    const go = vi.fn();
    act(() => routeIntoDebate(go));
    await waitFor(() => expect(go).toHaveBeenCalled());
    unmount();
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    expect(lobbyEvents('lobby_left')).toEqual([]);

    lobbyDebateSeen({ id: 'debate-1', lobby_id: 'lobby1' });
    lobbyDebateSeen({ id: 'debate-1', lobby_id: 'lobby1' });
    expect(lobbyEvents('lobby_left').map(props => props.exit)).toEqual(['debate_started']);
    expect(lobbyEvents('lobby_debate_started')).toEqual([expect.objectContaining({ debate_id: 'debate-1' })]);
  });

  it('attributes the debate when the server stepped the viewer out', async () => {
    const { result, unmount } = await goneAfterBeat('stepped_out');
    await waitFor(() => expect(result.current.state.status).toBe('stepped_out'));
    unmount();
    await act(async () => {});

    lobbyDebateSeen({ id: 'debate-1', lobby_id: 'lobby1' });
    expect(lobbyEvents('lobby_left').map(props => props.exit)).toEqual(['debate_started']);
    expect(lobbyEvents('lobby_debate_started')).toHaveLength(1);
  });

  it('marks a rejoin after stepping out as back_after_debate', async () => {
    const { result } = await goneAfterBeat('stepped_out');
    await waitFor(() => expect(result.current.state.status).toBe('stepped_out'));
    await act(() => result.current.join(false));
    await waitFor(() => expect(result.current.state.status).toBe('joined'));

    expect(lobbyEvents('lobby_joined').map(props => props.entry)).toEqual(['link', 'back_after_debate']);
    expect(lobbyEvents('lobby_left').map(props => props.exit)).toEqual(['unknown']);
  });
});

describe('lobby analytics from the lobby hooks (GEO-3311)', () => {
  it('puts the role the join answered with on lobby_joined', async () => {
    const { result } = renderHook(() => useLobbyPresence('lobby1', true), { wrapper });
    await waitFor(() => expect(result.current.state.status).toBe('joined'));

    expect(lobbyEvents('lobby_joined')).toEqual([expect.objectContaining({ role: 'speaker', hosting: false })]);
  });

  it('starts the session from the room the join answered with', async () => {
    const member = (id: string) => ({
      user_id: id,
      profile_space_id: `space-${id}`,
      display_name: null,
      avatar_cid: null,
      role: 'listener' as const,
      creator: false,
      acting_host: false,
      on_roster_since: '2026-10-05T10:00:00Z',
      stepped_out: false,
      in_debate: false,
    });
    api.setDebateLobbyPresence.mockImplementationOnce(async () => ({
      ...view(true),
      members: [member('u1'), member('u2')],
      guest_count: 1,
    }));
    const { result } = renderHook(() => useLobbyPresence('lobby1', true), { wrapper });
    await waitFor(() => expect(result.current.state.status).toBe('joined'));

    await act(() => result.current.leave());

    expect(lobbyEvents('lobby_left')).toEqual([expect.objectContaining({ peak_headcount: 3 })]);
  });

  it('records Going on the server’s confirmation, not on a refusal', async () => {
    api.setDebateLobbyReminder.mockResolvedValueOnce({
      ...view(false),
      scheduled: true,
      reminder_count: 4,
      viewer: { ...view(false).viewer, reminded: true },
    });
    api.setDebateLobbyReminder.mockRejectedValueOnce(
      new GeoChatRequestError('already open', 'lobby_already_open', 409, null, null)
    );
    const { result } = renderHook(() => useDebateLobbyReminder(), { wrapper });

    await act(() => result.current.mutateAsync({ lobbyId: 'lobby1', reminded: true }));
    await act(() => result.current.mutateAsync({ lobbyId: 'lobby1', reminded: true }).catch(() => undefined));

    expect(lobbyEvents('lobby_rsvp_changed')).toEqual([
      expect.objectContaining({ lobby_id: 'lobby1', going: true, going_count: 4 }),
    ]);
  });

  it('sends lobby_ended once the host’s End is confirmed', async () => {
    api.endDebateLobby.mockResolvedValueOnce({ ...view(false), scheduled: true });
    const { result } = renderHook(() => useEndDebateLobby('lobby1'), { wrapper });

    await act(() => result.current.mutateAsync());

    expect(lobbyEvents('lobby_ended')).toEqual([
      expect.objectContaining({ lobby_id: 'lobby1', scheduled: true, open_ms: expect.any(Number) }),
    ]);
  });
});
