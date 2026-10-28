'use client';

import * as React from 'react';

import type { DebateLobbySummary } from '../api';
import { useMatchmakingScope } from '../matchmaking/hooks';
import { useDebateLobbies } from './hooks';

/**
 * The lobbies the app promotes (GEO-3268): `live` is every open lobby, busiest first, and the panel
 * leads with the first. `next` is the soonest lobby still to open, which the panel shows only to a
 * signed-out visitor: signed in, lobbies still to open are the Requests timeline's (GEO-3519).
 */
export type LobbyLineup = {
  live: DebateLobbySummary[];
  next: DebateLobbySummary | null;
};

const EMPTY_LINEUP: LobbyLineup = { live: [], next: null };

/** Most people first; more of them debating breaks a tie, then the list's own order. */
function busiestFirst(a: DebateLobbySummary, b: DebateLobbySummary) {
  return b.headcount - a.headcount || b.debating_count - a.debating_count;
}

function opensAtMs(lobby: Pick<DebateLobbySummary, 'opens_at'>) {
  const at = Date.parse(lobby.opens_at);
  return Number.isNaN(at) ? Number.POSITIVE_INFINITY : at;
}

export function lobbyLineup(lobbies: DebateLobbySummary[]): LobbyLineup {
  if (lobbies.length === 0) return EMPTY_LINEUP;
  let next: DebateLobbySummary | null = null;
  for (const lobby of lobbies) {
    if (!lobby.open && (next === null || opensAtMs(lobby) < opensAtMs(next))) next = lobby;
  }
  return { live: lobbies.filter(lobby => lobby.open).sort(busiestFirst), next };
}

/**
 * The lobby lineup, for the navbar's Debate button, the panel's spotlight and the Explore banner.
 *
 * It holds the matchmaking scope while mounted, which is what carries `debate.lobbies_changed`. The
 * Debate button mounts it on every page, so the list stays live with the panel closed. Signed out
 * there is no scope and the list polls instead: see `useDebateLobbies`.
 */
export function useLobbyLineup(): LobbyLineup {
  useMatchmakingScope(true);
  const { data } = useDebateLobbies();
  const lobbies = data?.lobbies;

  return React.useMemo(() => (lobbies ? lobbyLineup(lobbies) : EMPTY_LINEUP), [lobbies]);
}
