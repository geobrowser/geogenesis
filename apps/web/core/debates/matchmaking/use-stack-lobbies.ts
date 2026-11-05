'use client';

import * as React from 'react';

import { type DebateLobbyCalendarRow, type DebateLobbySummary, dashlessId } from '~/core/debates/api';
import { useDismissedNotices } from '~/core/hooks/use-dismissed-notice';

import { useGeoChatAuth } from '../hooks';
import { useDebateLobbyCalendar } from '../lobbies/hooks';
import { localDaysFrom, startOfLocalDay } from '../lobbies/lobby-format';
import { useMinuteNow } from '../lobbies/use-minute-now';
import { useCurrentGeoChatUserId } from '../use-current-geo-chat-user-id';
import { UNANSWERED_LOBBY_DAYS, unansweredLobbies, unansweredLobbyRange } from './upcoming-lobby-rows';

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
 * The upcoming lobbies the stack offers: opening within {@link UNANSWERED_LOBBY_DAYS} local days, and
 * not one the viewer RSVP'd to, hosts, or dismissed, from the Requests timeline or from the stack.
 *
 * Signed out there is no RSVP, hosting or geo-chat dismissal to tell, so it is every lobby still to
 * open in the window, less the ones dismissed from the stack in this browser.
 */
export function stackLobbies(
  week: DebateLobbyCalendarRow[],
  viewer: { authenticated: boolean; viewerId: string | null },
  now: number,
  isDismissed: (lobbyId: string) => boolean
): DebateLobbyCalendarRow[] {
  const offered = viewer.authenticated
    ? unansweredLobbies(week, [], viewer.viewerId, now)
    : week.filter(lobby => {
        if (lobby.state !== 'upcoming') return false;
        const days = localDaysFrom(now, Date.parse(lobby.starts_at));
        return days >= 0 && days < UNANSWERED_LOBBY_DAYS;
      });
  return offered
    .filter(lobby => !isDismissed(lobby.lobby_id))
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
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

  // The lobbies offered last time that the viewer has since RSVP'd to, kept up showing Going.
  const [held, setHeld] = React.useState<string[]>([]);
  const offeredBefore = React.useRef<DebateLobbyCalendarRow[]>([]);
  React.useEffect(() => {
    const going = offeredBefore.current.filter(lobby =>
      week?.some(row => sameLobby(row, lobby) && row.viewer_reminded)
    );
    offeredBefore.current = offered;
    if (going.length > 0) setHeld(current => [...current, ...going.map(lobby => dashlessId(lobby.lobby_id))]);
  }, [offered, week]);
  React.useEffect(() => {
    if (held.length === 0) return;
    const timer = window.setTimeout(() => setHeld([]), STACK_GOING_HOLD_MS);
    return () => window.clearTimeout(timer);
  }, [held]);

  const lobbies = React.useMemo(() => {
    if (held.length === 0) return offered;
    const kept = (week ?? []).filter(
      row => held.includes(dashlessId(row.lobby_id)) && !offered.some(lobby => sameLobby(lobby, row))
    );
    return [...offered, ...kept].sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
  }, [held, offered, week]);

  const dismiss = React.useCallback((lobbyId: string) => remember([stackLobbyNoticeId(lobbyId)]), [remember]);

  return { lobbies, dismiss };
}

function sameLobby(a: Pick<DebateLobbySummary, 'lobby_id'>, b: Pick<DebateLobbySummary, 'lobby_id'>) {
  return dashlessId(a.lobby_id) === dashlessId(b.lobby_id);
}
