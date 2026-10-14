import '@testing-library/jest-dom/vitest';
import { act, render, renderHook, screen } from '@testing-library/react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DebateLobbySummary } from '../api';

type QueuedConfig = {
  id: string;
  requires: string;
  liveOnly: boolean;
  ready: boolean;
  run: (intent?: string) => Promise<void>;
};

const mocks = vi.hoisted(() => ({
  authenticated: true,
  listLoaded: true,
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
  useDebateLobbies: () => ({ data: mocks.listLoaded ? { lobbies: mocks.lobbies } : undefined }),
  useDebateLobbyReminder: () => ({ mutate: mocks.mutate, mutateAsync: mocks.mutateAsync, isPending: false }),
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

const lobby = (overrides: Partial<DebateLobbySummary> = {}) =>
  ({ lobby_id: 'abc-123', open: false, viewer_reminded: false, ...overrides }) as DebateLobbySummary;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authenticated = true;
  mocks.listLoaded = true;
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

    await act(() => mocks.config!.run('abc123'));
    expect(mocks.mutateAsync).toHaveBeenCalledWith({ lobbyId: 'abc-123', reminded: true });

    mocks.mutateAsync.mockClear();
    await act(() => mocks.config!.run('set'));
    await act(() => mocks.config!.run('live'));
    await act(() => mocks.config!.run('gone'));
    expect(mocks.mutateAsync).not.toHaveBeenCalled();
  });

  // Copilot on #2863: the panel can close during sign-up. The navbar's replay carries it then.
  it('replays from the navbar with no Remind me on screen', async () => {
    mocks.mutateAsync.mockResolvedValue(undefined);
    mocks.lobbies = [lobby()];
    renderHook(() => useLobbyReminderReplay());

    expect(mocks.config).toMatchObject({ id: 'lobby-reminder', ready: true });
    await act(() => mocks.config!.run('abc123'));
    expect(mocks.mutateAsync).toHaveBeenCalledWith({ lobbyId: 'abc-123', reminded: true });
  });

  // The runner turns a throw into a retry toast; the button already shows the failure.
  it('resolves rather than throws when the reminder fails', async () => {
    mocks.lobbies = [lobby()];
    renderHook(() => useLobbyReminderPress(lobby()));
    mocks.mutateAsync.mockRejectedValueOnce(new GeoChatRequestError('opened', 'lobby_already_open', 409));
    await expect(mocks.config!.run('abc123')).resolves.toBeUndefined();
    mocks.mutateAsync.mockRejectedValueOnce(new GeoChatRequestError('down', 'unavailable', 503));
    await expect(mocks.config!.run('abc123')).resolves.toBeUndefined();
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
});

describe('LobbyReminderError', () => {
  it('says the failure under the button, and nothing without one', () => {
    const { container } = render(<LobbyReminderError error={null} />);
    expect(container).toBeEmptyDOMElement();

    render(<LobbyReminderError error={new Error('boom')} className="text-right" />);
    expect(screen.getByText(/RSVP|try again/i)).toHaveClass('text-right');
  });
});
