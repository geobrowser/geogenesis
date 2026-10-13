'use client';

import * as React from 'react';

import cx from 'classnames';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';

import { urlWithoutModal } from '~/core/deep-links/modal-deep-link';

import { ChevronRight } from '~/design-system/icons/chevron-right';
import { Text } from '~/design-system/text';
import { useHorizontalOverflow } from '~/design-system/use-horizontal-overflow';

import type { DebateLobbySummary } from '../api';
import { lobbiesCalendarHref } from '../matchmaking/debate-calendar-route';
import { HubPillButton } from '../matchmaking/hub-pill-button';
import { useDebatesHub } from '../matchmaking/use-debates-hub';
import { debateRoomPath } from '../rooms/room-routes';
import { useDebateLobbyReminder } from './hooks';
import { type LobbyEntry, markLobbyEntry } from './lobby-analytics';
import { RSVP_FAILED, goingLabel, hostsLabel, lobbyErrorMessage, rsvpLabel } from './lobby-format';

/** How far one press of an edge arrow moves the row: most of a card, so the next one lands in view. */
const SCROLL_STEP_RATIO = 0.8;

/** "Today", "Tomorrow", "Wed", then "Oct 21" past a week. Local time. */
export function lobbyDayLabel(iso: string, now: number = Date.now()) {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  const today = new Date(now);
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const startOfDay = new Date(at.getFullYear(), at.getMonth(), at.getDate()).getTime();
  const days = Math.round((startOfDay - startOfToday) / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days > 1 && days < 7) return at.toLocaleDateString(undefined, { weekday: 'short' });
  return at.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** "4 PM", or "4:30 PM" off the hour. Local time. */
export function lobbyBadgeTime(iso: string) {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  return at.getMinutes() === 0
    ? at.toLocaleTimeString(undefined, { hour: 'numeric' })
    : at.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/** "Bryan · 6 going": the host, then the count once anyone has RSVP'd. */
export function lobbyByline(lobby: Pick<DebateLobbySummary, 'hosts' | 'reminder_count'>) {
  return [hostsLabel(lobby.hosts), lobby.reminder_count > 0 ? goingLabel(lobby.reminder_count) : null]
    .filter(Boolean)
    .join(' · ');
}

/** RSVP, or Going once set: black, so a lobby the viewer is going to stands out in a row of them. */
export function LobbyRsvpButton({
  lobby,
  analyticsLabelPrefix,
  className,
}: {
  lobby: Pick<DebateLobbySummary, 'lobby_id' | 'viewer_reminded'>;
  /** Names the click for analytics, e.g. "Upcoming lobbies". */
  analyticsLabelPrefix: string;
  className?: string;
}) {
  const reminder = useDebateLobbyReminder();
  return (
    <div className={cx('flex flex-col items-end gap-1', className)}>
      <HubPillButton
        variant={lobby.viewer_reminded ? 'primary' : 'secondary'}
        analyticsLabel={`${analyticsLabelPrefix} ${lobby.viewer_reminded ? 'Going' : 'RSVP'}`}
        aria-pressed={lobby.viewer_reminded}
        pending={reminder.isPending}
        onClick={() => reminder.mutate({ lobbyId: lobby.lobby_id, reminded: !lobby.viewer_reminded })}
        className="w-full"
      >
        {rsvpLabel(lobby.viewer_reminded)}
      </HubPillButton>
      {reminder.isError ? (
        <Text as="p" variant="footnote" color="red-01" className="text-right">
          {lobbyErrorMessage(reminder.error, RSVP_FAILED)}
        </Text>
      ) : null}
    </div>
  );
}

/** The date badge: the day over the start time. */
function DateBadge({ lobby }: { lobby: DebateLobbySummary }) {
  return (
    <div
      aria-hidden
      className="flex size-11 shrink-0 flex-col items-center justify-center rounded-md bg-grey-01 text-center"
    >
      <span className="text-footnoteMedium text-grey-04 uppercase">{lobbyDayLabel(lobby.starts_at)}</span>
      <span className="text-[16px] leading-[18px] font-semibold whitespace-nowrap">
        {lobbyBadgeTime(lobby.starts_at)}
      </span>
    </div>
  );
}

/** One scheduled lobby as a card in the row: its date, name, host and RSVP. */
function UpcomingLobbyCard({ lobby, entry }: { lobby: DebateLobbySummary; entry: LobbyEntry }) {
  const when = [lobbyDayLabel(lobby.starts_at), lobbyBadgeTime(lobby.starts_at)].filter(Boolean).join(' ');
  return (
    <li
      className="flex w-[300px] max-w-[80vw] shrink-0 snap-start items-center gap-3 rounded-lg border border-grey-02 bg-white p-3"
      data-testid="upcoming-lobby-card"
    >
      <DateBadge lobby={lobby} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <Link
          href={debateRoomPath(lobby.lobby_id)}
          onClick={() => markLobbyEntry(lobby.lobby_id, entry)}
          className="min-w-0 hover:underline"
        >
          <Text as="span" variant="metadataMedium" className="block truncate">
            <span className="sr-only">{when}: </span>
            {lobby.name}
          </Text>
        </Link>
        <Text as="span" variant="footnote" color="grey-04" className="truncate">
          {lobbyByline(lobby)}
        </Text>
      </div>
      <LobbyRsvpButton lobby={lobby} analyticsLabelPrefix="Upcoming lobbies" className="shrink-0" />
    </li>
  );
}

/**
 * Scheduled lobbies under the debates panel's tabs (GEO-3268): one row of date cards that scrolls
 * sideways, so a week of lobbies takes one card's height and the claims below never move. A fade and
 * an arrow on whichever edge has more, as the panel's tab row does. The whole week is a link away,
 * on the Calendar's Lobbies view.
 *
 * `lobbies` is what the spotlight above the tabs is not already showing.
 */
export function UpcomingLobbiesRow({
  lobbies,
  canHost,
  onOpenLobby,
}: {
  lobbies: DebateLobbySummary[];
  canHost: boolean;
  onOpenLobby: () => void;
}) {
  const scrollerRef = React.useRef<HTMLUListElement>(null);
  const overflow = useHorizontalOverflow(scrollerRef);
  const { close } = useDebatesHub();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (lobbies.length === 0 && !canHost) return null;

  const scrollBy = (direction: -1 | 1) => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const left = scroller.scrollLeft + direction * scroller.clientWidth * SCROLL_STEP_RATIO;
    if (typeof scroller.scrollTo === 'function') scroller.scrollTo({ left, behavior: 'smooth' });
    else scroller.scrollLeft = left;
  };
  const from = urlWithoutModal(pathname, searchParams, typeof window === 'undefined' ? '' : window.location.hash);

  return (
    <section aria-label="Upcoming debate lobbies" className="flex flex-col gap-2 pt-3" data-testid="upcoming-lobbies">
      <div className="flex items-center justify-between gap-2 px-4">
        <Text as="h3" variant="footnoteMedium" color="text">
          {lobbies.length > 0 ? `Upcoming lobbies · ${lobbies.length}` : 'Upcoming lobbies'}
        </Text>
        {canHost ? (
          <HubPillButton analyticsLabel="Open a lobby" onClick={onOpenLobby}>
            Open a lobby
          </HubPillButton>
        ) : null}
      </div>

      {lobbies.length > 0 ? (
        <>
          <div className="relative">
            <ul
              ref={scrollerRef}
              className="no-scrollbar flex snap-x snap-mandatory scroll-px-4 gap-2 overflow-x-auto overscroll-x-contain px-4"
            >
              {lobbies.map(lobby => (
                <UpcomingLobbyCard key={lobby.lobby_id} lobby={lobby} entry="side_panel" />
              ))}
            </ul>
            {overflow.start ? <EdgeArrow side="start" onClick={() => scrollBy(-1)} /> : null}
            {overflow.end ? <EdgeArrow side="end" onClick={() => scrollBy(1)} /> : null}
          </div>
          <div className="flex justify-end px-4">
            <Link
              href={lobbiesCalendarHref(from)}
              onClick={close}
              data-geo-analytics-label="Upcoming lobbies See the week on Calendar"
              data-geo-analytics-intent="open_debate_calendar"
              className="text-footnote text-grey-04 hover:text-text hover:underline"
            >
              See the week on Calendar →
            </Link>
          </div>
        </>
      ) : null}
    </section>
  );
}

function EdgeArrow({ side, onClick }: { side: 'start' | 'end'; onClick: () => void }) {
  return (
    <div
      className={cx(
        'pointer-events-none absolute top-0 bottom-0 flex w-14 items-center',
        side === 'start' ? 'left-0 justify-start bg-linear-to-r pl-2' : 'right-0 justify-end bg-linear-to-l pr-2',
        'from-white from-40% to-transparent'
      )}
    >
      <button
        type="button"
        aria-label={side === 'start' ? 'Show earlier lobbies' : 'Show more lobbies'}
        data-geo-analytics-label={`Upcoming lobbies scroll ${side === 'start' ? 'left' : 'right'}`}
        data-geo-analytics-intent="scroll_lobbies"
        onClick={onClick}
        className="pointer-events-auto grid size-7 place-items-center rounded-full border border-grey-02 bg-white text-text transition-colors hover:bg-grey-01"
      >
        <span className={cx('grid place-items-center', side === 'start' && 'rotate-180')}>
          <ChevronRight />
        </span>
      </button>
    </div>
  );
}
