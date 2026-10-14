import { act, renderHook } from '@testing-library/react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DebateLobbySummary } from '../api';

type QueuedConfig = {
  id: string;
  requires: string;
  liveOnly: boolean;
  ready: boolean;
  run: () => Promise<void>;
};

const mocks = vi.hoisted(() => ({
  authenticated: true,
  listLoaded: true,
  mutate: vi.fn(),
  mutateAsync: vi.fn(),
  signIn: vi.fn(),
  queue: vi.fn(),
  cancel: vi.fn(),
  queued: false,
  config: undefined as QueuedConfig | undefined,
}));

vi.mock('../hooks', () => ({ useGeoChatAuth: () => ({ authenticated: mocks.authenticated }) }));
vi.mock('./hooks', () => ({
  useDebateLobbies: () => ({ data: mocks.listLoaded ? { lobbies: [] } : undefined }),
  useDebateLobbyReminder: () => ({ mutate: mocks.mutate, mutateAsync: mocks.mutateAsync, isPending: false }),
}));
vi.mock('~/core/hooks/use-privy-sign-in', () => ({ usePrivySignIn: () => mocks.signIn }));
vi.mock('~/core/state/pending-actions', () => ({
  useQueuedAction: (config: QueuedConfig) => {
    mocks.config = config;
    return { intent: undefined, isQueued: mocks.queued, queue: mocks.queue, cancel: mocks.cancel };
  },
}));

const { GeoChatRequestError } = await import('../api');
const { useLobbyReminderPress } = await import('./lobby-reminder-press');

const lobby = (overrides: Partial<DebateLobbySummary> = {}) =>
  ({ lobby_id: 'abc-123', open: false, viewer_reminded: false, ...overrides }) as DebateLobbySummary;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authenticated = true;
  mocks.listLoaded = true;
  mocks.queued = false;
  mocks.config = undefined;
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
  it('queues the reminder and opens the account prompt for a signed-out visitor', () => {
    mocks.authenticated = false;
    const { result } = renderHook(() => useLobbyReminderPress(lobby()));
    act(() => result.current.press());

    expect(mocks.mutate).not.toHaveBeenCalled();
    expect(mocks.queue).toHaveBeenCalledOnce();
    expect(mocks.signIn).toHaveBeenCalledWith(
      expect.objectContaining({ target_type: 'debate_lobby', target_id: 'abc123', auth_control: 'remind_lobby' }),
      { onCancel: mocks.cancel }
    );
    expect(mocks.config).toMatchObject({ id: 'lobby-reminder:abc123', requires: 'auth', liveOnly: true });
  });

  it('draws a queued reminder as set', () => {
    mocks.authenticated = false;
    mocks.queued = true;
    const { result } = renderHook(() => useLobbyReminderPress(lobby()));
    expect(result.current.reminded).toBe(true);
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

  it('sets the reminder on replay, and skips a lobby already reminded or opened', async () => {
    mocks.mutateAsync.mockResolvedValue(undefined);
    const { rerender } = renderHook(({ target }) => useLobbyReminderPress(target), {
      initialProps: { target: lobby() },
    });
    await act(() => mocks.config!.run());
    expect(mocks.mutateAsync).toHaveBeenCalledWith({ lobbyId: 'abc-123', reminded: true });

    mocks.mutateAsync.mockClear();
    rerender({ target: lobby({ viewer_reminded: true }) });
    await act(() => mocks.config!.run());
    rerender({ target: lobby({ open: true }) });
    await act(() => mocks.config!.run());
    expect(mocks.mutateAsync).not.toHaveBeenCalled();
  });

  // The runner turns a throw into a retry toast; the button already shows the failure.
  it('resolves rather than throws when the reminder fails', async () => {
    renderHook(() => useLobbyReminderPress(lobby()));
    mocks.mutateAsync.mockRejectedValueOnce(new GeoChatRequestError('opened', 'lobby_already_open', 409));
    await expect(mocks.config!.run()).resolves.toBeUndefined();
    mocks.mutateAsync.mockRejectedValueOnce(new GeoChatRequestError('down', 'unavailable', 503));
    await expect(mocks.config!.run()).resolves.toBeUndefined();
  });

  it('does nothing without a lobby', () => {
    const { result } = renderHook(() => useLobbyReminderPress(null));
    act(() => result.current.press());
    expect(mocks.mutate).not.toHaveBeenCalled();
    expect(mocks.config?.ready).toBe(false);
  });
});
