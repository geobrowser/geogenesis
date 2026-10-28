import type { DebateLobbySummary } from '../api';

/** How far ahead the debate hours page looks (GEO-3517): this week, from now. */
export const DEBATE_HOURS_WINDOW_MS = 7 * 24 * 60 * 60_000;

/**
 * What the debate hours page shows (GEO-3517).
 *
 * `featured` leads the page: a lobby that is open now, busiest first, else the next one to start.
 * `rest` is every other lobby starting within {@link DEBATE_HOURS_WINDOW_MS}, soonest first.
 * `goingTotal` adds up the RSVPs across everything shown, for the line under the headline.
 */
export type DebateHours = {
  featured: DebateLobbySummary | null;
  rest: DebateLobbySummary[];
  goingTotal: number;
};

function startsAtMs(lobby: Pick<DebateLobbySummary, 'starts_at'>) {
  const at = Date.parse(lobby.starts_at);
  return Number.isNaN(at) ? Number.POSITIVE_INFINITY : at;
}

export function debateHours(lobbies: DebateLobbySummary[], now: number): DebateHours {
  const live = lobbies
    .filter(lobby => lobby.open)
    .sort((a, b) => b.headcount - a.headcount || b.debating_count - a.debating_count);
  // Still to open and starting this week. One whose start has just passed but that the server has not
  // opened yet is kept: it is about to open, and dropping it for those seconds would make the page jump.
  const upcoming = lobbies
    .filter(lobby => !lobby.open && startsAtMs(lobby) < now + DEBATE_HOURS_WINDOW_MS)
    .sort((a, b) => startsAtMs(a) - startsAtMs(b));

  const shown = [...live, ...upcoming];
  const [featured = null, ...rest] = shown;
  return {
    featured,
    rest,
    goingTotal: upcoming.reduce((total, lobby) => total + lobby.reminder_count, 0),
  };
}
