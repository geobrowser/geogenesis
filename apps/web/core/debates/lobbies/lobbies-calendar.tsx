'use client';

import * as Popover from '@radix-ui/react-popover';

import * as React from 'react';

import cx from 'classnames';
import Link from 'next/link';

import { useFeatureFlag } from '~/core/state/feature-flags';

import { Text } from '~/design-system/text';

import type { DebateLobbySummary } from '../api';
import { CalendarWeekNav, useMinuteClock } from '../matchmaking/debate-calendar-controls';
import {
  CALENDAR_WEEKS,
  DAYS_IN_WEEK,
  cellKey,
  cellOf,
  dayListLabel,
  firstBusyHour,
  hourLabel,
  hourStart,
  weekDays,
  weekStart,
} from '../matchmaking/debate-calendar-model';
import { CalendarWeekFrame, CalendarWeekSkeleton, NowLine } from '../matchmaking/debate-calendar-week';
import { HubPillButton, hubPillClassName } from '../matchmaking/hub-pill-button';
import { HubQueryState } from '../matchmaking/hub-states';
import { debateRoomPath } from '../rooms/room-routes';
import { useDebateLobbies } from './hooks';
import { markLobbyEntry } from './lobby-analytics';
import { goingLabel, lobbyDateLabel } from './lobby-format';
import { LobbyHostNames } from './lobby-host-names';
import { joinLabel, liveLobbyCounts } from './lobby-spotlight';
import { OpenLobbyDialog } from './open-lobby-dialog';
import { LobbyRsvpButton, lobbyBadgeTime } from './upcoming-lobbies';

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

/** The same lobbies by the grid's day and hour (`cellKey`), each hour soonest first. */
export function lobbiesByCell(lobbies: DebateLobbySummary[], days: Date[], goingOnly: boolean) {
  const byCell = new Map<string, DebateLobbySummary[]>();
  const sorted = [...lobbies].sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
  for (const lobby of sorted) {
    if (goingOnly && !lobby.viewer_reminded) continue;
    const cell = cellOf(Date.parse(lobby.starts_at), days);
    if (!cell) continue;
    const key = cellKey(cell.day, cell.hour);
    byCell.set(key, [...(byCell.get(key) ?? []), lobby]);
  }
  return byCell;
}

/** Blocks drawn in a busy hour before the rest collapse into "+N more", as the admin week does. */
const BLOCKS_PER_BUSY_CELL = 2;

/**
 * The debate calendar's Lobbies view (GEO-3268): the availability week's grid, a column per day
 * and a row per hour, with each lobby a block in the hour it starts, as the admin week draws
 * debates. A block opens the lobby's card: its time, name, hosts, and RSVP, or Join once live.
 * On a phone, the week as a list by day, as the other views have it.
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

  // Eight local midnights, as the grid takes them: the week's seven days and the one closing it.
  const days = React.useMemo(() => weekDays(weekStart(new Date(now), weekOffset)), [now, weekOffset]);
  const byCell = React.useMemo(() => lobbiesByCell(lobbies, days, goingOnly), [lobbies, days, goingOnly]);
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
          loadingFallback={<CalendarWeekSkeleton />}
          error={lobbiesQuery.data ? null : lobbiesQuery.error}
          failureReason={lobbiesQuery.failureReason}
          onRetry={() => void lobbiesQuery.refetch()}
          isEmpty={byCell.size === 0}
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
            <LobbiesDayList days={days} lobbies={lobbies} goingOnly={goingOnly} />
          ) : (
            <LobbiesWeek key={days[0].getTime()} days={days} byCell={byCell} now={now} />
          )}
        </HubQueryState>
      </div>

      {dialogOpen ? <OpenLobbyDialog onClose={() => setDialogOpen(false)} /> : null}
    </div>
  );
}

function LobbiesWeek({
  days,
  byCell,
  now,
}: {
  days: Date[];
  byCell: ReadonlyMap<string, DebateLobbySummary[]>;
  now: number;
}) {
  const nowCell = cellOf(now, days);
  return (
    <CalendarWeekFrame
      days={days}
      now={now}
      firstBusy={firstBusyHour(byCell, [], days)}
      role="table"
      ariaLabel="Debate lobbies each hour this week"
      renderCell={(date, day, hour) => {
        const key = cellKey(day, hour);
        return (
          <div
            key={key}
            role="cell"
            className={cx(
              'relative flex min-h-16 min-w-0 flex-col justify-center gap-1 border-r border-grey-01 px-2 py-1.5 last:border-r-0',
              hourStart(days, day, hour) + 60 * 60_000 <= now ? 'bg-grey-01/50' : 'bg-white'
            )}
          >
            {nowCell?.day === day && nowCell.hour === hour ? <NowLine now={now} /> : null}
            <CellLobbies lobbies={byCell.get(key) ?? []} date={date} hour={hour} />
          </div>
        );
      }}
    />
  );
}

/**
 * An hour's lobbies. One gets the full block; two or more go compact, one line each, so a busy hour
 * keeps its row height. Past two, the rest collapse into "+N more", which lists the whole hour.
 */
function CellLobbies({ lobbies, date, hour }: { lobbies: DebateLobbySummary[]; date: Date; hour: number }) {
  if (lobbies.length === 0) return null;
  if (lobbies.length === 1) return <LobbyBlock lobby={lobbies[0]!} />;
  const shown = lobbies.slice(0, BLOCKS_PER_BUSY_CELL);
  const hidden = lobbies.length - shown.length;
  return (
    <>
      {shown.map(lobby => (
        <LobbyBlock key={lobby.lobby_id} lobby={lobby} compact />
      ))}
      {hidden > 0 ? <HourLobbies lobbies={lobbies} hidden={hidden} date={date} hour={hour} /> : null}
    </>
  );
}

/** "Live · 14 here" on a live lobby, else "4 PM · Bryan": what a block leads with. */
function blockLead(lobby: DebateLobbySummary) {
  return lobby.open ? `Live · ${liveLobbyCounts(lobby)}` : lobbyBadgeTime(lobby.starts_at);
}

/**
 * One lobby in its hour: dark while live, as a booked debate is on the availability week, outlined
 * while scheduled, the outline solid once the viewer is going. Opens the lobby's card.
 */
function LobbyBlock({ lobby, compact = false }: { lobby: DebateLobbySummary; compact?: boolean }) {
  const hosts = lobby.hosts.map(host => host.display_name?.trim()).filter(Boolean);
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={[blockLead(lobby), lobby.name, lobby.viewer_reminded ? 'Going' : null].filter(Boolean).join(', ')}
          title={compact ? lobby.name : undefined}
          data-testid="lobby-calendar-block"
          data-geo-analytics-label="Lobby calendar block"
          className={cx(
            'flex w-full min-w-0 rounded-md border px-2 text-left text-footnote transition-shadow hover:shadow-inner-text data-[state=open]:shadow-inner-text',
            compact ? 'items-center gap-1 py-0.5' : 'flex-col gap-px py-1',
            lobby.open
              ? 'border-text bg-text text-white'
              : lobby.viewer_reminded
                ? 'border-text bg-white text-text'
                : 'border-grey-02 bg-white text-text'
          )}
        >
          {compact ? (
            <>
              {lobby.open ? <LiveDot /> : null}
              <span className="shrink-0 font-medium tabular-nums">
                {lobby.open ? 'Live' : lobbyBadgeTime(lobby.starts_at)}
              </span>
              <span className="min-w-0 flex-1 truncate">{lobby.name}</span>
            </>
          ) : (
            <>
              <span className="flex min-w-0 items-center gap-1">
                {lobby.open ? <LiveDot /> : null}
                <span className="truncate font-medium tabular-nums">
                  {lobby.open
                    ? blockLead(lobby)
                    : [lobbyBadgeTime(lobby.starts_at), hosts[0]].filter(Boolean).join(' · ')}
                </span>
              </span>
              <span className="truncate">{lobby.name}</span>
            </>
          )}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="right"
          align="start"
          sideOffset={8}
          collisionPadding={16}
          aria-label={lobby.name}
          className="z-100 w-[340px] max-w-[calc(100vw-32px)] rounded-xl border border-grey-02 bg-white p-4 shadow-lg"
        >
          <LobbyDetails lobby={lobby} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function LiveDot() {
  return (
    <span
      aria-hidden
      className="size-1.5 shrink-0 animate-pulse-strong rounded-full bg-green motion-reduce:animate-none"
    />
  );
}

/** "+N more" and the list it opens: every lobby in the hour, each as its card. */
function HourLobbies({
  lobbies,
  hidden,
  date,
  hour,
}: {
  lobbies: DebateLobbySummary[];
  hidden: number;
  date: Date;
  hour: number;
}) {
  const heading = `${date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}, ${hourLabel(hour)}`;
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={`All ${lobbies.length} lobbies at ${heading}`}
          className="self-start rounded-md px-1 text-footnoteMedium text-grey-04 transition-colors hover:bg-grey-01 hover:text-text"
        >
          +{hidden} more
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="right"
          align="start"
          sideOffset={8}
          collisionPadding={16}
          aria-label={heading}
          className="z-100 flex max-h-[min(36rem,calc(100vh-6rem))] w-[340px] max-w-[calc(100vw-32px)] flex-col gap-2 overflow-y-auto rounded-xl border border-grey-02 bg-white p-4 shadow-lg"
        >
          <Text as="p" variant="metadataMedium">
            {heading}
          </Text>
          <ul className="flex flex-col">
            {lobbies.map(lobby => (
              <li key={lobby.lobby_id} className="border-b border-grey-02 py-3 first:pt-1 last:border-b-0 last:pb-0">
                <LobbyDetails lobby={lobby} />
              </li>
            ))}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** A lobby's card: when (or Live and who is there), its name, hosts and who is going, and RSVP or Join. */
function LobbyDetails({ lobby }: { lobby: DebateLobbySummary }) {
  const href = debateRoomPath(lobby.lobby_id);
  const enter = () => markLobbyEntry(lobby.lobby_id, 'calendar');
  return (
    <div className="flex flex-col gap-2" data-testid="lobby-calendar-card">
      <Text as="p" variant="footnoteMedium" color="grey-04" className="flex min-w-0 items-center gap-1.5">
        {lobby.open ? <LiveDot /> : null}
        <span className="truncate">
          {lobby.open ? `Live · ${liveLobbyCounts(lobby)}` : lobbyDateLabel(lobby.starts_at)}
        </span>
      </Text>
      <Link href={href} onClick={enter} className="min-w-0 hover:underline">
        <Text as="span" variant="metadataMedium" className="block truncate">
          {lobby.name}
        </Text>
      </Link>
      {lobby.hosts.length > 0 || lobby.reminder_count > 0 ? (
        <Text as="p" variant="footnote" color="grey-04" className="truncate">
          {lobby.hosts.length > 0 ? (
            <>
              Hosted by <LobbyHostNames hosts={lobby.hosts} analyticsLabel="Lobby calendar host" />
            </>
          ) : null}
          {lobby.hosts.length > 0 && lobby.reminder_count > 0 ? ' · ' : null}
          {lobby.reminder_count > 0 ? goingLabel(lobby.reminder_count) : null}
        </Text>
      ) : null}
      {lobby.open ? (
        <Link
          href={href}
          onClick={enter}
          data-geo-analytics-label={lobby.viewer_on_roster ? 'Lobby calendar Open' : 'Lobby calendar Join'}
          data-geo-analytics-intent="join_lobby"
          className={hubPillClassName(lobby.viewer_on_roster ? 'secondary' : 'primary', 'self-start')}
        >
          {joinLabel(lobby, true)}
        </Link>
      ) : (
        <LobbyRsvpButton lobby={lobby} analyticsLabelPrefix="Lobby calendar" className="items-start self-start" />
      )}
    </div>
  );
}

/** The week on a phone: a heading per day with lobbies, and each lobby's card under it. */
function LobbiesDayList({
  days,
  lobbies,
  goingOnly,
}: {
  days: Date[];
  lobbies: DebateLobbySummary[];
  goingOnly: boolean;
}) {
  const week = days.slice(0, DAYS_IN_WEEK);
  const byDay = lobbiesByDay(lobbies, week, goingOnly);
  const today = new Date();
  return (
    <div className="-mx-4 flex flex-col">
      {week.map((date, index) =>
        byDay[index]!.length === 0 ? null : (
          <section key={date.getTime()} aria-label={dayListLabel(date, today)}>
            <Text as="h2" variant="listSemibold" className="border-b border-grey-02 px-4 pt-3 pb-1.5">
              {dayListLabel(date, today)}
            </Text>
            <ul className="flex flex-col gap-2 px-4 py-2">
              {byDay[index]!.map(lobby => (
                <li key={lobby.lobby_id} className="rounded-lg border border-grey-02 p-3">
                  <LobbyDetails lobby={lobby} />
                </li>
              ))}
            </ul>
          </section>
        )
      )}
    </div>
  );
}
