'use client';

import * as React from 'react';

import cx from 'classnames';
import Link from 'next/link';

import { useFeatureFlag } from '~/core/state/feature-flags';

import { Text } from '~/design-system/text';

import type { DebateLobbySummary } from '../api';
import { CalendarWeekNav, useMinuteClock } from '../matchmaking/debate-calendar-controls';
import { CALENDAR_WEEKS, DAYS_IN_WEEK, dayListLabel, weekDays, weekStart } from '../matchmaking/debate-calendar-model';
import { debateActionAnalyticsAttributes, debateAnalyticsLabel } from '../matchmaking/hub-analytics';
import { HubPillButton } from '../matchmaking/hub-pill-button';
import { HubQueryState } from '../matchmaking/hub-states';
import { debateRoomPath } from '../rooms/room-routes';
import { useDebateLobbies } from './hooks';
import { markLobbyEntry } from './lobby-analytics';
import { localDaysFrom } from './lobby-format';
import { LobbyByline } from './lobby-host-names';
import {
  LOBBY_DARK_SURFACE_CLASS_NAME,
  LOBBY_DARK_SURFACE_STYLE,
  LiveMark,
  SPOTLIGHT_ACTION_CLASS_NAME,
  joinLabel,
  liveLobbyCounts,
} from './lobby-spotlight';
import { OpenLobbyDialog } from './open-lobby-dialog';
import { LobbyRsvpButton, lobbyBadgeTime } from './upcoming-lobbies';

const NO_LOBBIES: DebateLobbySummary[] = [];

function sameLocalDay(iso: string, day: Date) {
  return localDaysFrom(day.getTime(), Date.parse(iso)) === 0;
}

/** The week's lobbies by day, each day soonest first. `goingOnly` keeps those the viewer RSVP'd to. */
export function lobbiesByDay(lobbies: DebateLobbySummary[], days: Date[], goingOnly: boolean) {
  return days.map(day =>
    lobbies
      .filter(lobby => sameLocalDay(lobby.starts_at, day) && (!goingOnly || lobby.viewer_reminded))
      .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at))
  );
}

/**
 * The debate calendar's Lobbies view (GEO-3268): the week's lobbies as a column per day, or a list
 * by day on a phone, each with RSVP, and Join on one that is live. Kept apart from the availability
 * week, which is for booking someone's free time; lobby blocks over it would fight that for room.
 *
 * Read from the same lobby list as the panel, which holds at most 20 upcoming lobbies and two per
 * host, and none that have ended (GEO-3271 asks geo-chat for the whole week).
 */
export function LobbiesCalendarBody({ isPhone }: { isPhone: boolean }) {
  const hosting = useFeatureFlag('lobbyHosting');
  const now = useMinuteClock();
  const [weekOffset, setWeekOffset] = React.useState(0);
  const [goingOnly, setGoingOnly] = React.useState(false);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const lobbiesQuery = useDebateLobbies();
  const lobbies = lobbiesQuery.data?.lobbies ?? NO_LOBBIES;

  // `weekDays` ends with the next week's first day, the week's exclusive bound; the nav takes it
  // whole, the grid draws only the seven days.
  const weekBounds = React.useMemo(() => weekDays(weekStart(new Date(now), weekOffset)), [now, weekOffset]);
  const days = React.useMemo(() => weekBounds.slice(0, DAYS_IN_WEEK), [weekBounds]);
  const byDay = React.useMemo(() => lobbiesByDay(lobbies, days, goingOnly), [lobbies, days, goingOnly]);
  const isEmpty = byDay.every(day => day.length === 0);
  const goToWeek = (next: number) => setWeekOffset(Math.max(0, Math.min(CALENDAR_WEEKS - 1, next)));

  return (
    <div className="flex flex-col" data-testid="lobbies-calendar">
      <CalendarWeekNav
        days={weekBounds}
        weekOffset={weekOffset}
        onGoToWeek={goToWeek}
        isPhone={isPhone}
        analyticsLabelPrefix="Lobby calendar"
      >
        <HubPillButton
          analyticsSurface="calendar"
          analyticsLabel="Lobby calendar Going only"
          variant={goingOnly ? 'primary' : 'secondary'}
          aria-pressed={goingOnly}
          onClick={() => setGoingOnly(on => !on)}
        >
          Going only
        </HubPillButton>
        {hosting ? (
          <HubPillButton
            analyticsSurface="calendar"
            analyticsLabel="Lobby calendar Open a lobby"
            variant="primary"
            onClick={() => setDialogOpen(true)}
          >
            Open a lobby
          </HubPillButton>
        ) : null}
      </CalendarWeekNav>

      <div className="px-6 pb-6 md:px-4">
        <HubQueryState
          analyticsSurface="calendar"
          isLoading={lobbiesQuery.isPending}
          error={lobbiesQuery.data ? null : lobbiesQuery.error}
          failureReason={lobbiesQuery.failureReason}
          onRetry={() => void lobbiesQuery.refetch()}
          isEmpty={isEmpty}
          emptyMessage={goingOnly ? 'You haven’t RSVP’d to a lobby this week.' : 'No lobbies scheduled this week.'}
          emptyAction={
            goingOnly
              ? { label: 'Show all lobbies', onClick: () => setGoingOnly(false) }
              : weekOffset < CALENDAR_WEEKS - 1
                ? { label: 'Next week', onClick: () => goToWeek(weekOffset + 1) }
                : undefined
          }
        >
          {isPhone ? (
            <ol className="flex flex-col gap-4">
              {days.map((day, index) =>
                byDay[index]!.length === 0 ? null : (
                  <li key={day.getTime()} className="flex flex-col gap-2">
                    <DayHeading day={day} now={now} />
                    <ul className="flex flex-col gap-2">
                      {byDay[index]!.map(lobby => (
                        <LobbyCalendarCard key={lobby.lobby_id} lobby={lobby} />
                      ))}
                    </ul>
                  </li>
                )
              )}
            </ol>
          ) : (
            <ol className="grid grid-cols-7 gap-2 border-t border-grey-02 pt-3">
              {days.map((day, index) => (
                <li key={day.getTime()} className="flex min-w-0 flex-col gap-2">
                  <DayHeading day={day} now={now} />
                  {byDay[index]!.length === 0 ? (
                    <Text as="p" variant="footnote" color="grey-03">
                      No lobbies
                    </Text>
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {byDay[index]!.map(lobby => (
                        <LobbyCalendarCard key={lobby.lobby_id} lobby={lobby} />
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ol>
          )}
        </HubQueryState>
      </div>

      {dialogOpen ? <OpenLobbyDialog onClose={() => setDialogOpen(false)} /> : null}
    </div>
  );
}

/** "Thu 8", or "Today, Thu 8", as the calendar's other views head a day. */
function DayHeading({ day, now }: { day: Date; now: number }) {
  return (
    <Text as="h3" variant="footnoteMedium" color={localDaysFrom(now, day.getTime()) === 0 ? 'text' : 'grey-04'}>
      {dayListLabel(day, new Date(now))}
    </Text>
  );
}

/** A lobby in its day: live and dark with Join, or its time and host over its name and RSVP. */
function LobbyCalendarCard({ lobby }: { lobby: DebateLobbySummary }) {
  const href = debateRoomPath(lobby.lobby_id);
  const enter = () => markLobbyEntry(lobby.lobby_id, 'calendar');

  if (lobby.open) {
    return (
      <li
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
      </li>
    );
  }

  return (
    <li
      className="flex flex-col gap-1.5 rounded-lg border border-grey-02 bg-white p-2.5"
      data-testid="lobby-calendar-card"
    >
      <Text as="p" variant="footnote" color="grey-04" className="truncate">
        <span className="font-medium text-text">{lobbyBadgeTime(lobby.starts_at)}</span>
        {lobby.hosts.length > 0 || lobby.reminder_count > 0 ? ' · ' : null}
        <LobbyByline lobby={lobby} analyticsLabel={debateAnalyticsLabel('calendar', 'Lobby calendar host')} />
      </Text>
      <Link href={href} onClick={enter} className="min-w-0 hover:underline">
        <Text as="span" variant="metadataMedium" className="block truncate">
          {lobby.name}
        </Text>
      </Link>
      <LobbyRsvpButton
        lobby={lobby}
        analyticsSurface="calendar"
        analyticsLabelPrefix="Lobby calendar"
        className="items-stretch"
      />
    </li>
  );
}
