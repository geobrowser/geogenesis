import { act, renderHook } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DebateLobbySummary } from '../api';

const START = Date.parse('2026-10-13T18:00:00Z');

const mocks = vi.hoisted(() => ({ lobbies: [] as DebateLobbySummary[] }));

vi.mock('~/core/state/feature-flags', () => ({ useFeatureFlag: () => true }));
vi.mock('../matchmaking/hooks', () => ({ useMatchmakingScope: () => undefined }));
vi.mock('./hooks', () => ({ useDebateLobbies: () => ({ data: { lobbies: mocks.lobbies } }) }));

const { useLobbyLineup } = await import('./live-lobbies');

const scheduled = (id: string, opensAt: number): DebateLobbySummary => ({
  lobby_id: id,
  name: id,
  scheduled: true,
  starts_at: new Date(opensAt + 10 * 60_000).toISOString(),
  opens_at: new Date(opensAt).toISOString(),
  open: false,
  hosts: [],
  headcount: 0,
  avatars: [],
  debating_count: 0,
  reminder_count: 0,
  viewer_reminded: false,
  viewer_on_roster: false,
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(START);
  mocks.lobbies = [];
});

afterEach(() => {
  vi.useRealTimers();
});

// GEO-3268. The lineup's clock only moved at the next boundary it knew of, so a lobby added after
// the page had been open a while was judged against the time the page opened.
describe('useLobbyLineup', () => {
  it('puts a lobby added later in the soon window against the current time, not the mount time', () => {
    const { result, rerender } = renderHook(() => useLobbyLineup());
    expect(result.current.soon).toBeNull();

    // Half an hour on, a host schedules a lobby to open in ten minutes: 40 minutes after mount.
    act(() => vi.setSystemTime(START + 30 * 60_000));
    mocks.lobbies = [scheduled('new', START + 40 * 60_000)];
    rerender();

    expect(result.current.soon?.lobby_id).toBe('new');
  });

  it('moves a later lobby into the soon window when it reaches it', () => {
    mocks.lobbies = [scheduled('later', START + 20 * 60_000)];
    const { result } = renderHook(() => useLobbyLineup());
    expect(result.current.soon).toBeNull();
    expect(result.current.later.map(lobby => lobby.lobby_id)).toEqual(['later']);

    act(() => vi.advanceTimersByTime(5 * 60_000 + 1_000));
    expect(result.current.soon?.lobby_id).toBe('later');
  });
});
