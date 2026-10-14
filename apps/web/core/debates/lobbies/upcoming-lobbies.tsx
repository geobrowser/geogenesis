'use client';

import * as React from 'react';

import cx from 'classnames';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';

import { urlWithoutModal } from '~/core/deep-links/modal-deep-link';

import { Text } from '~/design-system/text';
import { useHorizontalOverflow } from '~/design-system/use-horizontal-overflow';

import type { DebateLobbySummary } from '../api';
import { calendarHref } from '../matchmaking/debate-calendar-route';
import {
  type DebateAnalyticsSurface,
  debateAnalyticsLabel,
  hubAnalyticsAttributes,
} from '../matchmaking/hub-analytics';
import { HubPillButton } from '../matchmaking/hub-pill-button';
import { ScrollEdgeButton, scrollRowBy } from '../matchmaking/scrollable-tab-row';
import { useDebatesHub } from '../matchmaking/use-debates-hub';
import { debateRoomPath } from '../rooms/room-routes';
import { useDebateLobbyReminder, useLobbyReminderError } from './hooks';
import { type LobbyEntry, markLobbyEntry } from './lobby-analytics';
import { RSVP_FAILED, lobbyErrorMessage, localDaysFrom, rsvpLabel } from './lobby-format';
import { LobbyByline } from './lobby-host-names';

/** "Today", "Tomorrow", "Wed", then "Oct 21" past a week. Local time. */
export function lobbyDayLabel(iso: string, now: number = Date.now()) {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  const days = localDaysFrom(now, at.getTime());
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

/** RSVP, or Going once set: black, so a lobby the viewer is going to stands out in a row of them. */
export function LobbyRsvpButton({
  lobby,
  analyticsSurface = 'hub',
  analyticsLabelPrefix,
  className,
}: {
  lobby: Pick<DebateLobbySummary, 'lobby_id' | 'viewer_reminded' | 'open'>;
  analyticsSurface?: DebateAnalyticsSurface;
  /** Names the click for analytics, after the surface's prefix, e.g. "Upcoming lobby". */
  analyticsLabelPrefix: string;
  className?: string;
}) {
  const reminder = useDebateLobbyReminder();
  const error = useLobbyReminderError(reminder, lobby);
  return (
    <div className={cx('flex flex-col items-end gap-1', className)}>
      <HubPillButton
        variant={lobby.viewer_reminded ? 'primary' : 'secondary'}
        analyticsSurface={analyticsSurface}
        // Prefixed here: HubPillButton takes an explicit label as given, so the surface would not reach it.
        analyticsLabel={debateAnalyticsLabel(
          analyticsSurface,
          `${analyticsLabelPrefix} ${lobby.viewer_reminded ? 'Going' : 'RSVP'}`
        )}
        aria-pressed={lobby.viewer_reminded}
        pending={reminder.isPending}
        onClick={() => reminder.mutate({ lobbyId: lobby.lobby_id, reminded: !lobby.viewer_reminded })}
        className="w-full"
      >
        {rsvpLabel(lobby.viewer_reminded)}
      </HubPillButton>
      {error ? (
        <Text as="p" variant="footnote" color="red-01" className="text-right">
          {lobbyErrorMessage(error, RSVP_FAILED)}
        </Text>
      ) : null}
    </div>
  );
}

/** The date badge: the day over the start time. At least square, wider for "Tomorrow" or "4:30 PM". */
function DateBadge({ lobby }: { lobby: DebateLobbySummary }) {
  return (
    <div
      aria-hidden
      className="flex h-11 min-w-11 shrink-0 flex-col items-center justify-center rounded-md bg-grey-01 px-2 text-center"
    >
      <span className="text-footnoteMedium text-grey-04 uppercase">{lobbyDayLabel(lobby.starts_at)}</span>
      <span className="text-[16px] leading-[18px] font-semibold whitespace-nowrap">
        {lobbyBadgeTime(lobby.starts_at)}
      </span>
    </div>
  );
}

/** One scheduled lobby as a card in the row: its date, name, host and RSVP. */
function UpcomingLobbyCard({
  lobby,
  entry,
  alone,
}: {
  lobby: DebateLobbySummary;
  entry: LobbyEntry;
  /** The only card: it fills the row instead of leaving most of it empty. */
  alone: boolean;
}) {
  const when = [lobbyDayLabel(lobby.starts_at), lobbyBadgeTime(lobby.starts_at)].filter(Boolean).join(' ');
  return (
    <li
      className={cx(
        'flex shrink-0 snap-start items-center gap-3 rounded-lg border border-grey-02 bg-white p-3',
        alone ? 'w-full' : 'w-[300px] max-w-[80vw]'
      )}
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
          <LobbyByline lobby={lobby} analyticsLabel={debateAnalyticsLabel('hub', 'Upcoming lobby host')} />
        </Text>
      </div>
      <LobbyRsvpButton lobby={lobby} analyticsLabelPrefix="Upcoming lobby" className="shrink-0" />
    </li>
  );
}

/**
 * Scheduled lobbies under the debates panel's tabs (GEO-3268): one row of date cards that scrolls
 * sideways, so a week of lobbies takes one card's height and the claims below never move. A fade and
 * an arrow on whichever edge has more, as the panel's tab row does. The whole week is a link away,
 * pinned above the hours on the Calendar.
 *
 * `lobbies` is what the spotlight above the tabs is not already showing.
 */
export function UpcomingLobbiesRow({
  lobbies,
  loadFailed = false,
  canHost,
  onOpenLobby,
}: {
  lobbies: DebateLobbySummary[];
  /** The list could not be read: said in place of the cards. */
  loadFailed?: boolean;
  canHost: boolean;
  onOpenLobby: () => void;
}) {
  const { close } = useDebatesHub();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (lobbies.length === 0 && !canHost && !loadFailed) return null;

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

      {loadFailed ? (
        <Text as="p" variant="footnote" color="grey-04" className="px-4">
          Could not load lobbies.
        </Text>
      ) : lobbies.length > 0 ? (
        <>
          <UpcomingLobbiesScroller lobbies={lobbies} />
          <div className="flex justify-end px-4">
            <Link
              href={calendarHref(from)}
              onClick={close}
              {...hubAnalyticsAttributes('Upcoming lobbies See the week on Calendar', 'open_debate_calendar')}
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

/**
 * The cards, scrolling sideways. Its own component so the overflow hook mounts with the scroller it
 * measures: the row itself first draws before any lobby has loaded. The cards sit in a list sized to
 * them, which the hook also observes, so lobbies added later are measured too, as the tab row's are.
 */
function UpcomingLobbiesScroller({ lobbies }: { lobbies: DebateLobbySummary[] }) {
  const scrollerRef = React.useRef<HTMLDivElement>(null);
  const overflow = useHorizontalOverflow(scrollerRef);

  return (
    <div className="relative">
      {/* `overscroll-x-contain` so a swipe that reaches the end does not chain into the browser's
          back gesture. */}
      <div
        ref={scrollerRef}
        className="no-scrollbar snap-x snap-mandatory scroll-px-4 overflow-x-auto overscroll-x-contain"
      >
        {/* Sized to its cards, except a lone card's, which fills the panel and truncates its name
            rather than growing the list to fit it. */}
        <ul className={cx('flex gap-2 px-4', lobbies.length === 1 ? 'w-full' : 'w-max')}>
          {lobbies.map(lobby => (
            <UpcomingLobbyCard key={lobby.lobby_id} lobby={lobby} entry="side_panel" alone={lobbies.length === 1} />
          ))}
        </ul>
      </div>
      {(['start', 'end'] as const).map(side =>
        overflow[side] ? (
          <ScrollEdgeButton
            key={side}
            side={side}
            ariaLabel={side === 'start' ? 'Show earlier lobbies' : 'Show more lobbies'}
            analyticsLabel={debateAnalyticsLabel(
              'hub',
              `Upcoming lobbies scroll ${side === 'start' ? 'left' : 'right'}`
            )}
            analyticsIntent="scroll_lobbies"
            onClick={() => {
              if (scrollerRef.current) scrollRowBy(scrollerRef.current, side === 'start' ? -1 : 1);
            }}
            className={cx('bottom-0 w-14', side === 'start' ? 'pl-2' : 'pr-2')}
            buttonClassName="size-7 border border-grey-02 bg-white text-text hover:bg-grey-01"
          />
        ) : null
      )}
    </div>
  );
}
