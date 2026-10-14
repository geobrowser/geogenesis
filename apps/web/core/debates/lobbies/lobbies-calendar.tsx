'use client';

import * as Popover from '@radix-ui/react-popover';

import * as React from 'react';

import cx from 'classnames';
import Link from 'next/link';

import { Text } from '~/design-system/text';

import type { DebateLobbySummary } from '../api';
import { DAYS_IN_WEEK, cellOf } from '../matchmaking/debate-calendar-model';
import {
  CALENDAR_BLOCK_CLASS_NAME,
  CALENDAR_COMPACT_BLOCK_CLASS_NAME,
  CALENDAR_MORE_BUTTON_CLASS_NAME,
  type PinnedRow,
} from '../matchmaking/debate-calendar-week';
import { debateActionAnalyticsAttributes, debateAnalyticsLabel } from '../matchmaking/hub-analytics';
import { debateRoomPath } from '../rooms/room-routes';
import { useDebateLobbies } from './hooks';
import { markLobbyEntry } from './lobby-analytics';
import { LobbyByline } from './lobby-host-names';
import {
  LOBBY_DARK_SURFACE_CLASS_NAME,
  LOBBY_DARK_SURFACE_STYLE,
  LiveDot,
  LiveMark,
  SPOTLIGHT_ACTION_CLASS_NAME,
  joinLabel,
  liveLobbyCounts,
} from './lobby-spotlight';
import { LobbyRsvpButton, lobbyBadgeTime } from './upcoming-lobbies';

const CALENDAR_HOST_LABEL = debateAnalyticsLabel('calendar', 'Lobby calendar host');

/** Chips drawn in a day before the rest collapse into "+N more", as the admin week's busy hours do. */
const CHIPS_PER_DAY = 2;

/**
 * The week's lobbies by day, each day soonest first. `days` is the calendar's eight midnights, and a
 * lobby goes on the day `cellOf` puts it, as the viewer's own debates do.
 */
export function lobbiesByDay(lobbies: DebateLobbySummary[], days: Date[]) {
  const byDay = Array.from({ length: DAYS_IN_WEEK }, (): DebateLobbySummary[] => []);
  const soonestFirst = [...lobbies].sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
  for (const lobby of soonestFirst) {
    const cell = cellOf(Date.parse(lobby.starts_at), days);
    if (cell) byDay[cell.day]!.push(lobby);
  }
  return byDay;
}

export type WeekLobbies = {
  /** `null` before the list loads, or with none that week: nothing to draw. */
  byDay: DebateLobbySummary[][] | null;
  /** The first read is in flight, so a week without people is not known to be empty yet. */
  isLoading: boolean;
  /** The read failed with nothing to show, for the calendar's partial-load note. */
  error: unknown;
  refetch: () => void;
};

/**
 * The debate lobbies in the calendar's week, by day (GEO-3268), for the row pinned above the hours
 * and the phone's day list, with the read's state so the calendar can tell loading or failed from
 * a week without lobbies.
 *
 * Read from the panel's lobby list, which holds at most 20 upcoming lobbies and two per host, and
 * none that have ended (GEO-3271 asks geo-chat for the whole week).
 */
export function useWeekLobbies(days: Date[]): WeekLobbies {
  const { data, isLoading, error, refetch } = useDebateLobbies();
  const byDay = React.useMemo(() => {
    if (!data) return null;
    const week = lobbiesByDay(data.lobbies, days);
    return week.some(day => day.length > 0) ? week : null;
  }, [data, days]);

  return {
    byDay,
    // `isLoading`, not `isPending`: a disabled read (signed out) is pending for good.
    isLoading,
    error: data ? null : error,
    refetch: () => void refetch(),
  };
}

/** The row pinned under the calendar's day headers: each day's lobbies as chips. */
export function lobbiesPinnedRow(byDay: DebateLobbySummary[][]): PinnedRow {
  return {
    label: 'Lobbies',
    renderDay: (_date, day) => <LobbyDayChips lobbies={byDay[day] ?? []} />,
  };
}

/** A day's lobbies on the phone's day list, as cards, above its people. `null` for a day with none. */
export function lobbyDayLeads(byDay: DebateLobbySummary[][]): (React.ReactNode | null)[] {
  return byDay.map(lobbies =>
    lobbies.length === 0 ? null : (
      <div className="flex flex-col gap-2" data-testid="lobby-day-cards">
        {lobbies.map(lobby => (
          <LobbyCalendarCard key={lobby.lobby_id} lobby={lobby} />
        ))}
      </div>
    )
  );
}

function LobbyDayChips({ lobbies }: { lobbies: DebateLobbySummary[] }) {
  if (lobbies.length === 0) return null;
  const shown = lobbies.slice(0, CHIPS_PER_DAY);
  const hidden = lobbies.slice(shown.length);
  return (
    <>
      {shown.map(lobby => (
        <LobbyChip key={lobby.lobby_id} lobby={lobby} />
      ))}
      {hidden.length > 0 ? (
        <LobbyPopover
          label={`${hidden.length} more lobbies`}
          trigger={
            <button
              type="button"
              {...debateActionAnalyticsAttributes('calendar', 'Lobby chips more', 'open_lobby_card')}
              className={CALENDAR_MORE_BUTTON_CLASS_NAME}
            >
              +{hidden.length} more
            </button>
          }
        >
          {lobbies.map(lobby => (
            <LobbyCalendarCard key={lobby.lobby_id} lobby={lobby} />
          ))}
        </LobbyPopover>
      ) : null}
    </>
  );
}

/**
 * One lobby in the pinned row: its time and name, or Live and its name while open. Dark while live,
 * outlined while scheduled, the outline solid once the viewer is going. Opens the lobby's card.
 */
function LobbyChip({ lobby }: { lobby: DebateLobbySummary }) {
  const time = lobby.open ? 'Live' : lobbyBadgeTime(lobby.starts_at);
  return (
    <LobbyPopover
      label={lobby.name}
      trigger={
        <button
          type="button"
          aria-label={[time, lobby.name, lobby.viewer_reminded && !lobby.open ? 'going' : null]
            .filter(Boolean)
            .join(', ')}
          title={lobby.name}
          {...debateActionAnalyticsAttributes('calendar', 'Lobby chip', 'open_lobby_card')}
          data-testid="lobby-chip"
          className={cx(
            CALENDAR_BLOCK_CLASS_NAME,
            CALENDAR_COMPACT_BLOCK_CLASS_NAME,
            lobby.open
              ? cx('border-transparent text-white', LOBBY_DARK_SURFACE_CLASS_NAME)
              : lobby.viewer_reminded
                ? 'border-text bg-white text-text'
                : 'border-grey-02 bg-white text-text'
          )}
        >
          {lobby.open ? <LiveDot /> : null}
          <span className="shrink-0 font-medium tabular-nums">{time}</span>
          <span className="min-w-0 truncate">{lobby.name}</span>
        </button>
      }
    >
      <LobbyCalendarCard lobby={lobby} />
    </LobbyPopover>
  );
}

/** The calendar's card popover, as its hour and admin blocks open theirs. */
function LobbyPopover({
  label,
  trigger,
  children,
}: {
  label: string;
  trigger: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>{trigger}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="start"
          sideOffset={6}
          collisionPadding={16}
          aria-label={label}
          className="z-100 flex max-h-[min(36rem,calc(100vh-6rem))] w-[300px] max-w-[calc(100vw-32px)] flex-col gap-2 overflow-y-auto rounded-xl border border-grey-02 bg-white p-3 shadow-lg"
        >
          {children}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** A lobby's card: live and dark with Join, or its time and host over its name and RSVP. */
export function LobbyCalendarCard({ lobby }: { lobby: DebateLobbySummary }) {
  const href = debateRoomPath(lobby.lobby_id);
  const enter = () => markLobbyEntry(lobby.lobby_id, 'calendar');

  if (lobby.open) {
    return (
      <div
        className={cx('flex flex-col gap-2 rounded-lg p-2.5', LOBBY_DARK_SURFACE_CLASS_NAME)}
        style={LOBBY_DARK_SURFACE_STYLE}
        data-testid="lobby-calendar-card"
      >
        <div className="flex min-w-0 items-center gap-1">
          <LiveMark count={1} className="inline-flex shrink-0 items-center gap-1.5" />
          <Text as="span" variant="footnote" color="grey-03" className="truncate">
            · {liveLobbyCounts(lobby)}
          </Text>
        </div>
        <Text as="p" variant="metadataMedium" color="white" className="truncate">
          {lobby.name}
        </Text>
        {lobby.hosts.length > 0 ? (
          <Text as="p" variant="footnote" color="grey-03" className="truncate">
            <LobbyByline lobby={lobby} analyticsLabel={CALENDAR_HOST_LABEL} hostedBy />
          </Text>
        ) : null}
        <Link
          href={href}
          onClick={enter}
          {...debateActionAnalyticsAttributes(
            'calendar',
            lobby.viewer_on_roster ? 'Lobby calendar Open' : 'Lobby calendar Join',
            'join_lobby'
          )}
          className={SPOTLIGHT_ACTION_CLASS_NAME}
        >
          {joinLabel(lobby, true)}
        </Link>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col gap-1.5 rounded-lg border border-grey-02 bg-white p-2.5"
      data-testid="lobby-calendar-card"
    >
      <Text as="p" variant="footnote" color="grey-04" className="truncate">
        <span className="font-medium text-text">{lobbyBadgeTime(lobby.starts_at)}</span>
        {lobby.hosts.length > 0 || lobby.reminder_count > 0 ? ' · ' : null}
        <LobbyByline lobby={lobby} analyticsLabel={CALENDAR_HOST_LABEL} />
      </Text>
      <Link href={href} onClick={enter} className="min-w-0 hover:underline">
        <Text as="span" variant="metadataMedium" className="block truncate">
          {lobby.name}
        </Text>
      </Link>
      <LobbyRsvpButton
        lobby={lobby}
        analyticsSurface="calendar"
        analyticsLabelPrefix="Lobby"
        className="items-stretch"
      />
    </div>
  );
}
