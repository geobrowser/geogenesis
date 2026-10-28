import type { DebateLobbySummary } from '../api';
import { lobbyLineup } from './live-lobbies';

/** How far ahead the debate hours page looks (GEO-3517): this week, from now. */
export const DEBATE_HOURS_WINDOW_MS = 7 * 24 * 60 * 60_000;

/**
 * What the debate hours page shows (GEO-3517), in the order the rest of the app promotes lobbies
 * (`lobbyLineup`).
 *
 * `featured` leads the page: a lobby that is open now, busiest first, else the next one to open.
 * `rest` is every other lobby starting within {@link DEBATE_HOURS_WINDOW_MS}, soonest first.
 * `goingTotal` adds up the RSVPs across everything shown, for the line under the headline.
 */
export type DebateHours = {
  featured: DebateLobbySummary | null;
  rest: DebateLobbySummary[];
  goingTotal: number;
};

export function debateHours(lobbies: DebateLobbySummary[], now: number): DebateHours {
  const { live, soon, later } = lobbyLineup(lobbies, now);
  // `lobbyLineup` keeps a lobby whose time has passed but that the server has not opened yet, so
  // the window has no lower bound either.
  const upcoming = (soon ? [soon, ...later] : later).filter(
    lobby => Date.parse(lobby.starts_at) < now + DEBATE_HOURS_WINDOW_MS
  );

  const [featured = null, ...rest] = [...live, ...upcoming];
  return {
    featured,
    rest,
    goingTotal: upcoming.reduce((total, lobby) => total + lobby.reminder_count, 0),
  };
}
