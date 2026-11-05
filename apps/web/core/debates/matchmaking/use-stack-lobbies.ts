'use client';

import * as React from 'react';

import { type DebateLobbyCalendarRow, type DebateLobbySummary, dashlessId } from '~/core/debates/api';
import { useDismissedNotices } from '~/core/hooks/use-dismissed-notice';

import { useGeoChatAuth } from '../hooks';
import { useDebateLobbyCalendar } from '../lobbies/hooks';
import { startOfLocalDay } from '../lobbies/lobby-format';
import { useMinuteNow } from '../lobbies/use-minute-now';
import { sameId } from '../rooms/room-presence';
import { useCurrentGeoChatUserId } from '../use-current-geo-chat-user-id';
import { inUnansweredLobbyWindow, unansweredLobbies, unansweredLobbyRange } from './upcoming-lobby-rows';

/**
 * How long a lobby's card stays up showing Going after the RSVP lands, before it leaves the stack:
 * the Today's claims callout's pause after an answer, so both read the same.
 */
export const STACK_GOING_HOLD_MS = 700;

/**
 * The dismissed-notice ids for the panel's lobby cards (GEO-3586). Dismissing one only takes it out
 * of the stack, so these are the browser's to keep, not geo-chat's: the lobby stays on the Requests
 * timeline. A live lobby has its own id, so a lobby dismissed while upcoming still shows once live.
 */
export function stackLobbyNoticeId(lobbyId: string) {
  return `debatesPanelUpcomingLobby:${dashlessId(lobbyId)}`;
}

export function stackLiveLobbyNoticeId(lobbyId: string) {
  return `debatesPanelLiveLobby:${dashlessId(lobbyId)}`;
}

/**
 * The upcoming lobbies the stack offers, soonest first: the Requests timeline's unanswered ones
 * (`unansweredLobbies`), less the ones dismissed from the stack.
 *
 * Signed out there is no RSVP, hosting or geo-chat dismissal to tell, so it is every lobby in the
 * same window, less the ones dismissed from the stack in this browser.
 */
export function stackLobbies(
  week: DebateLobbyCalendarRow[],
  viewer: { authenticated: boolean; viewerId: string | null },
  now: number,
  isDismissed: (lobbyId: string) => boolean
): DebateLobbyCalendarRow[] {
  const offered = viewer.authenticated
    ? unansweredLobbies(week, [], viewer.viewerId, now)
    : week.filter(lobby => inUnansweredLobbyWindow(lobby, now));
  return offered.filter(lobby => !isDismissed(lobby.lobby_id)).sort(soonestFirst);
}

/**
 * The panel stack's upcoming lobbies, soonest first, and how to dismiss one from it.
 *
 * Read from the calendar's next seven days, the range the Requests timeline reads, so the two share
 * one query and an RSVP or a dismissal written by either shows in both. A lobby just RSVP'd to stays
 * for {@link STACK_GOING_HOLD_MS}, showing Going, so the press is seen before its card leaves.
 */
export function useStackLobbies(): { lobbies: DebateLobbySummary[]; dismiss: (lobbyId: string) => void } {
  const now = useMinuteNow();
  const today = startOfLocalDay(now);
  const range = React.useMemo(() => unansweredLobbyRange(today), [today]);
  const { ready, authenticated } = useGeoChatAuth();
  const viewerId = useCurrentGeoChatUserId();
  const { data } = useDebateLobbyCalendar(range.from, range.to, true, { signedOut: true, keepPreviousRange: true });
  const week = data?.lobbies;
  const { isDismissed, remember } = useDismissedNotices();

  const offered = React.useMemo(
    () =>
      ready && week
        ? stackLobbies(week, { authenticated, viewerId }, now, id => isDismissed(stackLobbyNoticeId(id)))
        : [],
    [authenticated, isDismissed, now, ready, viewerId, week]
  );

  // The lobbies offered last time that the viewer has since RSVP'd to, kept up showing Going. Taken
  // while rendering rather than in an effect: an effect runs after paint, so the card would be drawn
  // gone for a frame, and the stack would start sliding it out before it came back.
  // Compared by which lobbies, not by the array, which is rebuilt whenever its inputs are.
  const [held, setHeld] = React.useState<string[]>([]);
  const offeredIds = offered.map(lobby => dashlessId(lobby.lobby_id)).join(',');
  const [before, setBefore] = React.useState({ ids: offeredIds, lobbies: offered });
  if (before.ids !== offeredIds) {
    setBefore({ ids: offeredIds, lobbies: offered });
    const going = before.lobbies.filter(lobby =>
      week?.some(row => sameId(row.lobby_id, lobby.lobby_id) && row.viewer_reminded)
    );
    if (going.length > 0) setHeld(current => [...current, ...going.map(lobby => dashlessId(lobby.lobby_id))]);
  }
  React.useEffect(() => {
    if (held.length === 0) return;
    const timer = window.setTimeout(() => setHeld([]), STACK_GOING_HOLD_MS);
    return () => window.clearTimeout(timer);
  }, [held]);

  const lobbies = React.useMemo(() => {
    if (held.length === 0) return offered;
    const kept = (week ?? []).filter(
      row => held.includes(dashlessId(row.lobby_id)) && !offered.some(lobby => sameId(lobby.lobby_id, row.lobby_id))
    );
    return [...offered, ...kept].sort(soonestFirst);
  }, [held, offered, week]);

  const dismiss = React.useCallback((lobbyId: string) => remember([stackLobbyNoticeId(lobbyId)]), [remember]);

  return { lobbies, dismiss };
}

function soonestFirst(a: Pick<DebateLobbySummary, 'starts_at'>, b: Pick<DebateLobbySummary, 'starts_at'>) {
  return Date.parse(a.starts_at) - Date.parse(b.starts_at);
}
