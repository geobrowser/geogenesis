'use client';

import * as React from 'react';

import type { DebateLobbySummary } from '../api';
import { useMatchmakingScope } from '../matchmaking/hooks';
import { useDebateLobbies } from './hooks';

/** How long before a scheduled lobby opens that it takes the spotlight with a countdown (GEO-3268). */
export const LOBBY_SOON_WINDOW_MS = 15 * 60_000;

/**
 * The lobbies the app promotes, in the order it promotes them (GEO-3268).
 *
 * `live` is every open lobby, busiest first: the navbar counts them, the panel and the Explore
 * banner lead with the first. `soon` is the next scheduled lobby opening within
 * {@link LOBBY_SOON_WINDOW_MS}, which takes the panel's spotlight only while nothing is live.
 * `later` is every other scheduled lobby, soonest first.
 */
export type LobbyLineup = {
  live: DebateLobbySummary[];
  soon: DebateLobbySummary | null;
  later: DebateLobbySummary[];
};

const EMPTY_LINEUP: LobbyLineup = { live: [], soon: null, later: [] };
const NO_LOBBIES: DebateLobbySummary[] = [];

/** Most people first; more of them debating breaks a tie, then the list's own order. */
function busiestFirst(a: DebateLobbySummary, b: DebateLobbySummary) {
  return b.headcount - a.headcount || b.debating_count - a.debating_count;
}

function opensAtMs(lobby: Pick<DebateLobbySummary, 'opens_at'>) {
  const at = Date.parse(lobby.opens_at);
  return Number.isNaN(at) ? Number.POSITIVE_INFINITY : at;
}

export function lobbyLineup(lobbies: DebateLobbySummary[], now: number): LobbyLineup {
  if (lobbies.length === 0) return EMPTY_LINEUP;

  const live = lobbies.filter(lobby => lobby.open).sort(busiestFirst);
  const waiting = lobbies.filter(lobby => !lobby.open).sort((a, b) => opensAtMs(a) - opensAtMs(b));
  // A lobby past its opening time that the server has not opened yet still counts as soon: it is
  // about to, and dropping it to the list for the seconds in between would make the panel jump.
  const soon = waiting.find(lobby => opensAtMs(lobby) - now <= LOBBY_SOON_WINDOW_MS) ?? null;

  return { live, soon, later: waiting.filter(lobby => lobby !== soon) };
}

/**
 * The next moment the lineup can change on the clock alone: a scheduled lobby entering the soon
 * window. Opening itself arrives from the server, so it is not a boundary here. `null` for none.
 */
export function nextLineupBoundary(lobbies: DebateLobbySummary[], now: number): number | null {
  let next: number | null = null;
  for (const lobby of lobbies) {
    if (lobby.open) continue;
    const at = opensAtMs(lobby) - LOBBY_SOON_WINDOW_MS;
    if (at > now && (next === null || at < next)) next = at;
  }
  return next;
}

/** `setTimeout`'s ceiling; a later boundary is waited for in steps. */
const MAX_TIMEOUT_MS = 2_147_483_647;

/**
 * The time the lineup is judged at: re-read whenever the list changes, so a lobby added since mount
 * is placed against now rather than the mount time, and again when a scheduled lobby enters the soon
 * window, so the panel picks it up on time.
 */
function useLineupClock(lobbies: DebateLobbySummary[]) {
  const [now, setNow] = React.useState(() => Date.now());
  // Bumped at each boundary, which re-runs the effect: it reads the clock and waits for the next.
  const [boundaryTick, setBoundaryTick] = React.useState(0);

  React.useEffect(() => {
    const current = Date.now();
    setNow(current);
    const boundary = nextLineupBoundary(lobbies, current);
    if (boundary === null) return;
    const timeout = setTimeout(
      () => setBoundaryTick(tick => tick + 1),
      Math.min(boundary - current + 250, MAX_TIMEOUT_MS)
    );
    return () => clearTimeout(timeout);
  }, [lobbies, boundaryTick]);

  return now;
}

/**
 * The lobby lineup, for the navbar's Debate button, the panel's spotlight and the Explore banner.
 *
 * It holds the matchmaking scope while mounted, which is what carries `debate.lobbies_changed`. The
 * Debate button mounts it on every page, so the list stays live with the panel closed. Signed out
 * it is empty: see `useDebateLobbies`.
 */
export function useLobbyLineup(): LobbyLineup {
  useMatchmakingScope(true);
  const { data } = useDebateLobbies();
  const lobbies = data?.lobbies;
  const now = useLineupClock(lobbies ?? NO_LOBBIES);

  return React.useMemo(() => (lobbies ? lobbyLineup(lobbies, now) : EMPTY_LINEUP), [lobbies, now]);
}
