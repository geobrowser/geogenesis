import '@testing-library/jest-dom/vitest';
import { act, render, renderHook, screen } from '@testing-library/react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DebateLobbySummary } from '../api';

type QueuedConfig = {
  id: string;
  requires: string;
  liveOnly: boolean;
  ready: boolean;
  run: (intent: string | undefined, replay: { live: boolean; isCurrent: () => boolean }) => Promise<void>;
};

const mocks = vi.hoisted(() => ({
  authenticated: true,
  listLoaded: true,
  listFailed: false,
  savingElsewhere: false,
  refetch: vi.fn(),
  mutate: vi.fn(),
  mutateAsync: vi.fn(),
  signIn: vi.fn(),
  queue: vi.fn(),
  cancel: vi.fn(),
  intent: undefined as string | undefined,
  lobbies: [] as DebateLobbySummary[],
  config: undefined as QueuedConfig | undefined,
  error: null as unknown,
  errorFor: [] as unknown[],
}));

vi.mock('../hooks', () => ({ useGeoChatAuth: () => ({ authenticated: mocks.authenticated }) }));
vi.mock('./hooks', () => ({
  useDebateLobbies: () => ({
    data: mocks.listLoaded ? { lobbies: mocks.lobbies } : undefined,
    isError: mocks.listFailed,
    refetch: mocks.refetch,
  }),
  useDebateLobbyReminder: () => ({ mutate: mocks.mutate, mutateAsync: mocks.mutateAsync, isPending: false }),
  useLobbyReminderSaving: () => mocks.savingElsewhere,
  useLobbyReminderError: (_reminder: unknown, target: unknown) => {
    mocks.errorFor.push(target);
    return mocks.error;
  },
}));
vi.mock('~/core/hooks/use-privy-sign-in', () => ({ usePrivySignIn: () => mocks.signIn }));
vi.mock('~/core/state/pending-actions', () => ({
  useQueuedAction: (config: QueuedConfig) => {
    mocks.config = config;
    return { intent: mocks.intent, isQueued: mocks.intent !== undefined, queue: mocks.queue, cancel: mocks.cancel };
  },
}));

const { GeoChatRequestError } = await import('../api');
const { LobbyReminderError, useLobbyReminderPress, useLobbyReminderReplay } = await import('./lobby-reminder-press');

/** The runner's call; `current` false once the action was cancelled or replaced. */
const runReplay = (intent: string, current = true) =>
  mocks.config!.run(intent, { live: true, isCurrent: () => current });

const lobby = (overrides: Partial<DebateLobbySummary> = {}) =>
  ({ lobby_id: 'abc-123', open: false, viewer_reminded: false, ...overrides }) as DebateLobbySummary;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authenticated = true;
  mocks.listLoaded = true;
  mocks.listFailed = false;
  mocks.savingElsewhere = false;
  mocks.intent = undefined;
  mocks.lobbies = [];
  mocks.config = undefined;
  mocks.error = null;
  mocks.errorFor = [];
});

describe('useLobbyReminderPress', () => {
  it('sets and clears the reminder for a signed-in viewer, with no prompt', () => {
    const { result, rerender } = renderHook(({ target }) => useLobbyReminderPress(target), {
      initialProps: { target: lobby() },
    });
    act(() => result.current.press());
    expect(mocks.mutate).toHaveBeenLastCalledWith({ lobbyId: 'abc-123', reminded: true });

    rerender({ target: lobby({ viewer_reminded: true }) });
    act(() => result.current.press());
    expect(mocks.mutate).toHaveBeenLastCalledWith({ lobbyId: 'abc-123', reminded: false });
    expect(mocks.signIn).not.toHaveBeenCalled();
    expect(mocks.queue).not.toHaveBeenCalled();
  });

  // GEO-3289. Signed out, the press is kept and the account prompt opens.
  it('queues the reminder for this lobby and opens the account prompt for a signed-out visitor', () => {
    mocks.authenticated = false;
    const { result } = renderHook(() => useLobbyReminderPress(lobby()));
    act(() => result.current.press());

    expect(mocks.mutate).not.toHaveBeenCalled();
    expect(mocks.queue).toHaveBeenCalledWith('abc123');
    expect(mocks.signIn).toHaveBeenCalledWith(
      expect.objectContaining({ target_type: 'debate_lobby', target_id: 'abc123', auth_control: 'remind_lobby' }),
      { onCancel: mocks.cancel }
    );
    expect(mocks.config).toMatchObject({ id: 'lobby-reminder', requires: 'auth', liveOnly: true });
  });

  it('draws the queued reminder as set on its own lobby only', () => {
    mocks.intent = 'abc123';
    expect(renderHook(() => useLobbyReminderPress(lobby())).result.current.reminded).toBe(true);
    expect(renderHook(() => useLobbyReminderPress(lobby({ lobby_id: 'other' }))).result.current.reminded).toBe(false);
  });

  // A brand-new account is refused for a minute or two; its own list loading says it is known.
  it('replays only once signed in with the account’s list loaded', () => {
    mocks.authenticated = false;
    const { rerender } = renderHook(() => useLobbyReminderPress(lobby()));
    expect(mocks.config?.ready).toBe(false);

    mocks.authenticated = true;
    mocks.listLoaded = false;
    rerender();
    expect(mocks.config?.ready).toBe(false);

    mocks.listLoaded = true;
    rerender();
    expect(mocks.config?.ready).toBe(true);
  });

  // Decided from the account's list by id, so any mounted copy can replay it, and a lobby that
  // opened during sign-up (its card gone) is still dropped rather than left queued.
  it('sets the reminder on replay from the account’s list, and drops one reminded, opened or gone', async () => {
    mocks.mutateAsync.mockResolvedValue(undefined);
    mocks.lobbies = [
      lobby(),
      lobby({ lobby_id: 'set', viewer_reminded: true }),
      lobby({ lobby_id: 'live', open: true }),
    ];
    renderHook(() => useLobbyReminderPress(null));

    await act(() => runReplay('abc123'));
    expect(mocks.mutateAsync).toHaveBeenCalledWith({ lobbyId: 'abc-123', reminded: true });

    mocks.mutateAsync.mockClear();
    await act(() => runReplay('set'));
    await act(() => runReplay('live'));
    await act(() => runReplay('gone'));
    expect(mocks.mutateAsync).not.toHaveBeenCalled();
  });

  // Copilot on #2863: the panel can close during sign-up. The navbar's replay carries it then.
  it('replays from the navbar with no Remind me on screen', async () => {
    mocks.mutateAsync.mockResolvedValue(undefined);
    mocks.lobbies = [lobby()];
    renderHook(() => useLobbyReminderReplay());

    expect(mocks.config).toMatchObject({ id: 'lobby-reminder', ready: true });
    await act(() => runReplay('abc123'));
    expect(mocks.mutateAsync).toHaveBeenCalledWith({ lobbyId: 'abc-123', reminded: true });
  });

  // Copilot on #2863: the replay may run through the navbar or another lobby's card, neither of
  // which shows this lobby's error. A failure is thrown so the runner keeps it and offers Retry;
  // only a lobby that opened meanwhile (409) settles quietly.
  it('throws a failed replay for the runner to retry, and settles quietly on 409', async () => {
    mocks.lobbies = [lobby()];
    renderHook(() => useLobbyReminderReplay());
    mocks.mutateAsync.mockRejectedValueOnce(new GeoChatRequestError('opened', 'lobby_already_open', 409));
    await expect(runReplay('abc123')).resolves.toBeUndefined();
    mocks.mutateAsync.mockRejectedValueOnce(new GeoChatRequestError('down', 'unavailable', 503));
    await expect(runReplay('abc123')).rejects.toThrow('down');
  });

  it('does nothing on a press without a lobby', () => {
    const { result } = renderHook(() => useLobbyReminderPress(null));
    act(() => result.current.press());
    expect(mocks.mutate).not.toHaveBeenCalled();
    expect(mocks.queue).not.toHaveBeenCalled();
  });

  it('passes the reminder’s failure through, with an open stand-in when there is no lobby', () => {
    mocks.error = new GeoChatRequestError('down', 'unavailable', 503);
    const { result } = renderHook(() => useLobbyReminderPress(lobby()));
    expect(result.current.error).toBe(mocks.error);

    renderHook(() => useLobbyReminderPress(null));
    expect(mocks.errorFor.at(-1)).toMatchObject({ open: true });
  });

  // Copilot on #2863: Going while queued is what is on screen, so a press takes it back.
  it('takes back a reminder still queued for this lobby, rather than setting it again', () => {
    mocks.intent = 'abc123';
    const { result } = renderHook(() => useLobbyReminderPress(lobby()));
    act(() => result.current.press());
    expect(mocks.cancel).toHaveBeenCalledOnce();
    expect(mocks.mutate).not.toHaveBeenCalled();

    mocks.authenticated = false;
    const signedOut = renderHook(() => useLobbyReminderPress(lobby()));
    act(() => signedOut.result.current.press());
    expect(mocks.cancel).toHaveBeenCalledTimes(2);
    expect(mocks.signIn).not.toHaveBeenCalled();
  });

  it('withdraws a set reminder and drops any queued one with it', () => {
    mocks.intent = 'abc123';
    const { result } = renderHook(() => useLobbyReminderPress(lobby({ viewer_reminded: true })));
    act(() => result.current.press());
    expect(mocks.cancel).toHaveBeenCalledOnce();
    expect(mocks.mutate).toHaveBeenCalledWith({ lobbyId: 'abc-123', reminded: false });
  });

  // A replay already running through another copy must not restore one taken back meanwhile.
  it('does not set a reminder that was taken back while it was waiting', async () => {
    mocks.lobbies = [lobby()];
    renderHook(() => useLobbyReminderReplay());
    await act(() => runReplay('abc123', false));
    expect(mocks.mutateAsync).not.toHaveBeenCalled();
  });

  // Copilot on #2863: a list that failed for good must still reach the runner's Retry.
  it('replays on a failed list by reading it again, and throws if that fails too', async () => {
    mocks.listLoaded = false;
    mocks.listFailed = true;
    renderHook(() => useLobbyReminderReplay());
    expect(mocks.config?.ready).toBe(true);

    const failure = new GeoChatRequestError('down', 'unavailable', 503);
    mocks.refetch.mockResolvedValueOnce({ data: undefined, error: failure });
    await expect(runReplay('abc123')).rejects.toBe(failure);

    mocks.refetch.mockResolvedValueOnce({ data: { lobbies: [lobby()] }, error: null });
    mocks.mutateAsync.mockResolvedValue(undefined);
    await act(() => runReplay('abc123'));
    expect(mocks.mutateAsync).toHaveBeenCalledWith({ lobbyId: 'abc-123', reminded: true });
  });

  // Copilot on #2863: taking it back mid-write would lose the race to the write. Wait it out.
  it('is busy and ignores a press while another control is saving this lobby’s reminder', () => {
    mocks.savingElsewhere = true;
    mocks.intent = 'abc123';
    const { result } = renderHook(() => useLobbyReminderPress(lobby()));
    expect(result.current.pending).toBe(true);
    act(() => result.current.press());
    expect(mocks.cancel).not.toHaveBeenCalled();
    expect(mocks.mutate).not.toHaveBeenCalled();
  });
});

describe('LobbyReminderError', () => {
  it('says the failure under the button, and nothing without one', () => {
    const { container } = render(<LobbyReminderError error={null} />);
    expect(container).toBeEmptyDOMElement();

    render(<LobbyReminderError error={new Error('boom')} className="text-right" />);
    expect(screen.getByText(/RSVP|try again/i)).toHaveClass('text-right');
  });
});
