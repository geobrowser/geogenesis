'use client';

import * as React from 'react';

import cx from 'classnames';
import Link from 'next/link';

import { useFeatureFlag } from '~/core/state/feature-flags';

import { Text } from '~/design-system/text';

import type { DebateLobbySummary } from '../api';
import { CalendarWeekNav, useMinuteClock } from '../matchmaking/debate-calendar-controls';
import { CALENDAR_WEEKS, weekDays, weekStart } from '../matchmaking/debate-calendar-model';
import { HubPillButton } from '../matchmaking/hub-pill-button';
import { HubQueryState } from '../matchmaking/hub-states';
import { debateRoomPath } from '../rooms/room-routes';
import { useDebateLobbies } from './hooks';
import { markLobbyEntry } from './lobby-analytics';
import { LiveMark, SPOTLIGHT_ACTION_CLASS_NAME, joinLabel, liveLobbyCounts } from './lobby-spotlight';
import { OpenLobbyDialog } from './open-lobby-dialog';
import { LobbyRsvpButton, lobbyBadgeTime, lobbyByline } from './upcoming-lobbies';

const NO_LOBBIES: DebateLobbySummary[] = [];

function sameLocalDay(iso: string, day: Date) {
  const at = new Date(iso);
  return at.getFullYear() === day.getFullYear() && at.getMonth() === day.getMonth() && at.getDate() === day.getDate();
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

  const days = React.useMemo(() => weekDays(weekStart(new Date(now), weekOffset)), [now, weekOffset]);
  const byDay = React.useMemo(() => lobbiesByDay(lobbies, days, goingOnly), [lobbies, days, goingOnly]);
  const isEmpty = byDay.every(day => day.length === 0);
  const goToWeek = (next: number) => setWeekOffset(Math.max(0, Math.min(CALENDAR_WEEKS - 1, next)));

  return (
    <div className="flex flex-col" data-testid="lobbies-calendar">
      <CalendarWeekNav
        days={days}
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

function DayHeading({ day, now }: { day: Date; now: number }) {
  const today = sameLocalDay(new Date(now).toISOString(), day);
  const label = day.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' });
  return (
    <Text as="h3" variant="footnoteMedium" color={today ? 'text' : 'grey-04'}>
      {today ? `${label} · Today` : label}
    </Text>
  );
}

/** A lobby in its day: live and dark with Join, or its time, name, host and RSVP. */
function LobbyCalendarCard({ lobby }: { lobby: DebateLobbySummary }) {
  const href = debateRoomPath(lobby.lobby_id);
  const enter = () => markLobbyEntry(lobby.lobby_id, 'calendar');

  if (lobby.open) {
    return (
      <li
        className="flex flex-col gap-2 rounded-lg bg-[#151515] p-2.5"
        style={{ '--avatar-group-ring': '#151515' } as React.CSSProperties}
        data-testid="lobby-calendar-card"
      >
        <LiveMark count={1} />
        <Text as="p" variant="metadataMedium" color="white" className="truncate">
          {lobby.name}
        </Text>
        <Text as="p" variant="footnote" color="grey-03" className="truncate">
          {liveLobbyCounts(lobby)}
        </Text>
        <Link
          href={href}
          onClick={enter}
          data-geo-analytics-label={lobby.viewer_on_roster ? 'Lobby calendar Open' : 'Lobby calendar Join'}
          data-geo-analytics-intent="join_lobby"
          className={SPOTLIGHT_ACTION_CLASS_NAME}
        >
          {joinLabel(lobby, true)}
        </Link>
      </li>
    );
  }

  return (
    <li
      className={cx('flex flex-col gap-1.5 rounded-lg border border-grey-02 bg-white p-2.5')}
      data-testid="lobby-calendar-card"
    >
      <Text as="p" variant="footnoteMedium" color="grey-04">
        {lobbyBadgeTime(lobby.starts_at)}
      </Text>
      <Link href={href} onClick={enter} className="min-w-0 hover:underline">
        <Text as="span" variant="metadataMedium" className="block truncate">
          {lobby.name}
        </Text>
      </Link>
      <Text as="p" variant="footnote" color="grey-04" className="truncate">
        {lobbyByline(lobby)}
      </Text>
      <LobbyRsvpButton lobby={lobby} analyticsLabelPrefix="Lobby calendar" className="items-stretch" />
    </li>
  );
}
