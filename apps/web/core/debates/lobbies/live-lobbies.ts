'use client';

import * as React from 'react';

import type { DebateLobbySummary } from '../api';
import { useMatchmakingScope } from '../matchmaking/hooks';
import { useDebateLobbies } from './hooks';

/**
 * The lobbies the app promotes (GEO-3268): every open lobby, busiest first. The panel leads with the
 * first. A lobby still to open is the Requests timeline's (GEO-3519), not the lineup's.
 */
export type LobbyLineup = {
  live: DebateLobbySummary[];
};

const EMPTY_LINEUP: LobbyLineup = { live: [] };

/** Most people first; more of them debating breaks a tie, then the list's own order. */
function busiestFirst(a: DebateLobbySummary, b: DebateLobbySummary) {
  return b.headcount - a.headcount || b.debating_count - a.debating_count;
}

export function lobbyLineup(lobbies: DebateLobbySummary[]): LobbyLineup {
  if (lobbies.length === 0) return EMPTY_LINEUP;
  return { live: lobbies.filter(lobby => lobby.open).sort(busiestFirst) };
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
