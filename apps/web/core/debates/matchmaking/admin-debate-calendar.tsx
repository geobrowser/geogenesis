'use client';

import * as Popover from '@radix-ui/react-popover';

import * as React from 'react';

import cx from 'classnames';
import Link from 'next/link';

import { normId } from '~/core/utils/norm-id';
import { NavUtils, validateSpaceId } from '~/core/utils/utils';

import { Avatar } from '~/design-system/avatar';
import { Text } from '~/design-system/text';

import type { DebateParticipantSummary } from '../api';
import { speakerLabel } from '../playback-utils';
import type { useAdminScheduledDebates } from '../rooms/scheduling-hooks';
import {
  ANSWER_LABELS,
  type AdminDebate,
  type AdminDebater,
  type DebaterAnswer,
  MATCH_STATE_LABELS,
  type MatchState,
  ROLE_LABELS,
  STATUS_LABELS,
  adminDebates,
  adminDebatesByCell,
  needsAttention,
} from './admin-debate-calendar-model';
import {
  CALENDAR_WEEKS,
  DAYS_IN_WEEK,
  HOURS_IN_DAY,
  cellKey,
  cellOf,
  firstBusyHour,
  hourLabel,
  hourProgress,
  hourStart,
  timeRangeLabel,
  weekDays,
  weekOffsetLabels,
  weekRangeLabel,
  weekStart,
} from './debate-calendar-model';
import { CalendarWeekSkeleton, GRID_COLUMNS, NowLine } from './debate-calendar-week';
import { HubPillButton } from './hub-pill-button';
import { HubQueryState } from './hub-states';
import { useGeoChatUserSummaries } from './use-geo-chat-user-summaries';

type NameOf = (userId: string) => DebateParticipantSummary | null;

const STATE_CLASS_NAMES: Record<MatchState, string> = {
  confirmed: 'border border-green bg-successTertiary text-text',
  waiting: 'border border-orange bg-orange/15 text-text',
  unanswered: 'border border-dashed border-grey-03 bg-white text-text',
  off: 'border border-grey-02 bg-grey-01 text-grey-04',
};

const STATE_SWATCH_CLASS_NAMES: Record<MatchState, string> = {
  confirmed: 'border border-green bg-successTertiary',
  waiting: 'border border-orange bg-orange/15',
  unanswered: 'border border-dashed border-grey-03 bg-white',
  off: 'border border-grey-02 bg-grey-01',
};

const ANSWER_CLASS_NAMES: Record<DebaterAnswer, string> = {
  accepted: 'bg-successTertiary text-text',
  declined: 'bg-red-02 text-red-01',
  pending: 'bg-orange/15 text-text',
  no_answer: 'bg-grey-01 text-grey-04',
};

function pairLabel(debate: AdminDebate, nameOf: NameOf) {
  const names = debate.debaters.map(debater => {
    const known = nameOf(debater.userId);
    return known ? speakerLabel(known) : 'Someone';
  });
  return names.join(' vs ');
}

/** The colour key, which doubles as the meaning of each block's fill. */
export function AdminDebatesLegend() {
  const states: MatchState[] = ['confirmed', 'waiting', 'unanswered', 'off'];
  return (
    <ul className="flex flex-wrap items-center gap-3 text-footnote text-grey-04" aria-label="Legend">
      {states.map(state => (
        <li key={state} className="flex items-center gap-1.5">
          <span aria-hidden className={cx('h-2.5 w-3.5 rounded-sm', STATE_SWATCH_CLASS_NAMES[state])} />
          {MATCH_STATE_LABELS[state]}
        </li>
      ))}
      <li className="flex items-center gap-1.5">
        <span aria-hidden className="h-2 w-2 rounded-full bg-red-01" />
        Outside availability
      </li>
    </ul>
  );
}

/**
 * The admin calendar's week (GEO-2943): every scheduled debate in its hour, coloured by whether
 * both debaters, one, or neither has accepted. A block opens the match's detail card.
 *
 * Read-only. Acting on a match (resend, reschedule, cancel) is a later cut.
 */
export function AdminDebatesWeek({
  days,
  debates,
  nameOf,
  now,
}: {
  days: Date[];
  debates: AdminDebate[];
  nameOf: NameOf;
  now: number;
}) {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const rowRefs = React.useRef<(HTMLDivElement | null)[]>([]);
  const byCell = React.useMemo(() => adminDebatesByCell(debates, days), [days, debates]);

  const nowCell = cellOf(now, days);
  const nowHour = nowCell?.hour ?? null;
  const firstBusy = firstBusyHour(byCell, [], days);

  // As the availability week does: this week opens on the current time, other weeks on their first
  // debate. Once per week, so a poll landing does not pull the grid away from where it was read.
  const weekKey = days[0].getTime();
  const scrolledFor = React.useRef<number | null>(null);
  React.useLayoutEffect(() => {
    if (scrolledFor.current === weekKey) return;
    const container = scrollRef.current;
    const row = rowRefs.current[nowHour ?? firstBusy ?? new Date(now).getHours()];
    if (!container || !row) return;
    scrolledFor.current = weekKey;
    const rowTop = row.offsetTop - container.offsetTop;
    container.scrollTop = Math.max(
      0,
      nowHour === null ? rowTop - 8 : rowTop + hourProgress(now) * row.offsetHeight - container.clientHeight / 3
    );
  }, [firstBusy, now, nowHour, weekKey]);

  const offsets = weekOffsetLabels(days);

  return (
    <div className="overflow-x-auto rounded-lg border border-grey-02">
      <div role="table" aria-label="Scheduled debates each hour this week" className="min-w-[900px]">
        <div role="row" className={cx('grid border-b border-grey-02 bg-white', GRID_COLUMNS)}>
          <div
            role="columnheader"
            aria-label={`Time, ${offsets.join(' then ')}`}
            className="flex flex-col justify-end border-r border-grey-01 px-2 pb-1.5 text-footnote whitespace-nowrap text-grey-04 tabular-nums"
          >
            {offsets.map(label => (
              <span key={label} aria-hidden>
                {label}
              </span>
            ))}
          </div>
          {days.slice(0, DAYS_IN_WEEK).map((date, day) => (
            <div
              key={date.getTime()}
              role="columnheader"
              className="flex flex-col items-center border-r border-grey-01 px-2 py-2 last:border-r-0"
            >
              <Text as="span" variant="metadataMedium" color="grey-04">
                {date.toLocaleDateString(undefined, { weekday: 'short' })}
              </Text>
              <Text
                as="span"
                variant="smallTitle"
                className={cx(day === nowCell?.day && 'rounded-full bg-text px-2 text-white')}
              >
                {date.getDate()}
              </Text>
            </div>
          ))}
        </div>

        <div ref={scrollRef} className="max-h-[max(24rem,calc(100vh-22rem))] overflow-y-auto" role="rowgroup">
          {Array.from({ length: HOURS_IN_DAY }, (_, hour) => (
            <div
              key={hour}
              ref={element => {
                rowRefs.current[hour] = element;
              }}
              role="row"
              className={cx('grid border-b border-grey-01 last:border-b-0', GRID_COLUMNS)}
            >
              <div role="rowheader" className="border-r border-grey-01 px-2 py-1.5 text-footnote text-grey-04">
                {hourLabel(hour)}
              </div>
              {days.slice(0, DAYS_IN_WEEK).map((date, day) => {
                const key = cellKey(day, hour);
                const inCell = byCell.get(key) ?? [];
                const past = hourStart(days, day, hour) + 60 * 60_000 <= now;
                const isNowCell = nowCell?.day === day && nowCell.hour === hour;
                return (
                  <div
                    key={key}
                    role="cell"
                    className={cx(
                      'relative flex min-h-16 min-w-0 flex-col justify-center gap-1 border-r border-grey-01 px-2 py-1.5 last:border-r-0',
                      past ? 'bg-grey-01/50' : 'bg-white'
                    )}
                  >
                    {isNowCell ? <NowLine now={now} /> : null}
                    {inCell.map(debate => (
                      <AdminDebateBlock key={debate.requestId} debate={debate} nameOf={nameOf} />
                    ))}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AdminDebateBlock({ debate, nameOf }: { debate: AdminDebate; nameOf: NameOf }) {
  const pair = pairLabel(debate, nameOf);
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={`${timeRangeLabel(debate.start, debate.end)}, ${pair}, ${MATCH_STATE_LABELS[debate.state]}${
            debate.outsideAvailability ? ', outside availability' : ''
          }`}
          className={cx(
            'relative flex w-full min-w-0 flex-col rounded-md px-2 py-1 text-left text-footnoteMedium',
            STATE_CLASS_NAMES[debate.state]
          )}
        >
          {debate.outsideAvailability ? (
            <span aria-hidden className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-red-01" />
          ) : null}
          <span className="pr-3">{timeRangeLabel(debate.start, debate.end)}</span>
          <span className={cx('truncate font-normal', debate.state === 'off' && 'line-through')}>{pair}</span>
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="right"
          align="start"
          sideOffset={8}
          collisionPadding={16}
          aria-label={`${pair}, ${timeRangeLabel(debate.start, debate.end)}`}
          className="z-100 w-[340px] max-w-[calc(100vw-32px)] rounded-xl border border-grey-02 bg-white p-4 shadow-lg"
        >
          <AdminDebateDetails debate={debate} nameOf={nameOf} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** Everything the calendar knows about one match: when, its status, and each debater's own answer. */
export function AdminDebateDetails({ debate, nameOf }: { debate: AdminDebate; nameOf: NameOf }) {
  const when = new Date(debate.start).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <Text as="p" variant="metadataMedium">
          {when} · {timeRangeLabel(debate.start, debate.end)}
        </Text>
        <Text as="p" variant="footnote" color="grey-04">
          {STATUS_LABELS[debate.status]} · {MATCH_STATE_LABELS[debate.state]}
          {debate.createdByAdmin ? ' · Arranged by an admin' : ''}
          {debate.rescheduleCount > 0
            ? ` · Moved ${debate.rescheduleCount} time${debate.rescheduleCount === 1 ? '' : 's'}`
            : ''}
        </Text>
      </div>
      <ul className="flex flex-col gap-2">
        {debate.debaters.map(debater => (
          <DebaterRow key={debater.userId} debater={debater} summary={nameOf(debater.userId)} />
        ))}
      </ul>
      {debate.outsideAvailability ? (
        <Text as="p" variant="footnote" className="text-red-01">
          Booked outside at least one debater&rsquo;s availability.
        </Text>
      ) : null}
    </div>
  );
}

function DebaterRow({ debater, summary }: { debater: AdminDebater; summary: DebateParticipantSummary | null }) {
  const name = summary ? speakerLabel(summary) : 'Someone';
  const href = summary && validateSpaceId(summary.profile_space_id) ? NavUtils.toSpace(summary.profile_space_id) : null;
  return (
    <li className="flex items-center gap-2">
      <Avatar avatarUrl={summary?.avatar_cid ?? null} value={summary?.profile_space_id ?? debater.userId} size={28} />
      <div className="flex min-w-0 flex-1 flex-col">
        {href ? (
          <Link href={href} className="truncate text-metadataMedium hover:underline">
            {name}
          </Link>
        ) : (
          <Text as="span" variant="metadataMedium" className="truncate">
            {name}
          </Text>
        )}
        <Text as="span" variant="footnote" color="grey-04">
          {ROLE_LABELS[debater.role]}
        </Text>
      </div>
      <span className={cx('shrink-0 rounded-full px-2 py-0.5 text-footnoteMedium', ANSWER_CLASS_NAMES[debater.answer])}>
        {ANSWER_LABELS[debater.answer]}
      </span>
    </li>
  );
}

/** The admin calendar on a phone: the week's matches grouped by day, each with its details inline. */
export function AdminDebatesDayList({
  days,
  debates,
  nameOf,
}: {
  days: Date[];
  debates: AdminDebate[];
  nameOf: NameOf;
}) {
  const byDay = React.useMemo(() => {
    const today = new Date().toDateString();
    return days.slice(0, DAYS_IN_WEEK).map((date, day) => {
      const label = `${date.toLocaleDateString(undefined, { weekday: 'short' })} ${date.getDate()}`;
      return {
        key: date.getTime(),
        label: date.toDateString() === today ? `Today, ${label}` : label,
        debates: debates.filter(debate => cellOf(debate.start, days)?.day === day),
      };
    });
  }, [days, debates]);

  return (
    <div className="-mx-4 flex flex-col">
      {byDay
        .filter(day => day.debates.length > 0)
        .map(day => (
          <section key={day.key} aria-label={day.label}>
            <Text as="h2" variant="listSemibold" className="border-b border-grey-02 px-4 pt-3 pb-1.5">
              {day.label}
            </Text>
            <ul className="flex flex-col gap-2 px-4 py-2">
              {day.debates.map(debate => (
                <li key={debate.requestId} className={cx('rounded-lg p-3', STATE_CLASS_NAMES[debate.state])}>
                  <AdminDebateDetails debate={debate} nameOf={nameOf} />
                </li>
              ))}
            </ul>
          </section>
        ))}
    </div>
  );
}

/** A lookup from geo-chat user id to the graph's name and face, for the blocks and cards above. */
export function useNameOf(summaries: DebateParticipantSummary[]): NameOf {
  return React.useMemo(() => {
    const byUser = new Map(summaries.map(summary => [normId(summary.user_id), summary]));
    return (userId: string) => byUser.get(normId(userId)) ?? null;
  }, [summaries]);
}

export type CalendarView = 'availability' | 'debates';

/** Availability | Debates. Rendered only for an admin; everyone else has one view and no switch. */
export function CalendarViewSwitch({ view, onChange }: { view: CalendarView; onChange: (view: CalendarView) => void }) {
  const options: { value: CalendarView; label: string }[] = [
    { value: 'availability', label: 'Availability' },
    { value: 'debates', label: 'Debates' },
  ];
  return (
    <div role="radiogroup" aria-label="Calendar view" className="flex rounded-full border border-grey-02 p-0.5">
      {options.map(option => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={view === option.value}
          onClick={() => onChange(option.value)}
          className={cx(
            'rounded-full px-3 py-1 text-metadata transition-colors',
            view === option.value ? 'bg-text text-white' : 'text-grey-04 hover:text-text'
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/**
 * The admin half of the debate calendar (GEO-2943): every scheduled debate this week and next, in
 * any status, and each debater's own answer. Shown only once geo-chat has served the admin list,
 * so a viewer off its allowlist never reaches it.
 */
export function AdminDebatesBody({
  isPhone,
  admin,
}: {
  isPhone: boolean;
  admin: ReturnType<typeof useAdminScheduledDebates>;
}) {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(interval);
  }, []);

  const [weekOffset, setWeekOffset] = React.useState(0);
  const [attentionOnly, setAttentionOnly] = React.useState(false);

  const days = React.useMemo(() => weekDays(weekStart(new Date(now), weekOffset)), [now, weekOffset]);
  const all = React.useMemo(() => adminDebates(admin.data?.matches), [admin.data]);
  const shown = React.useMemo(() => (attentionOnly ? all.filter(needsAttention) : all), [all, attentionOnly]);
  const thisWeek = React.useMemo(() => shown.filter(debate => cellOf(debate.start, days) !== null), [days, shown]);
  const attentionCount = React.useMemo(
    () => all.filter(debate => needsAttention(debate) && cellOf(debate.start, days) !== null).length,
    [all, days]
  );

  const userIds = React.useMemo(
    () => [...new Set(all.flatMap(debate => debate.debaters.map(debater => debater.userId)))],
    [all]
  );
  const nameOf = useNameOf(useGeoChatUserSummaries(userIds, userIds.length > 0));

  const goToWeek = (next: number) => setWeekOffset(Math.max(0, Math.min(CALENDAR_WEEKS - 1, next)));
  const offsets = weekOffsetLabels(days);

  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-center gap-2 px-6 py-3 md:px-4">
        <HubPillButton
          aria-label="Previous week"
          analyticsSurface="calendar"
          analyticsLabel="Admin debate calendar Previous week"
          disabled={weekOffset === 0}
          onClick={() => goToWeek(weekOffset - 1)}
          className="w-7 px-0"
        >
          ‹
        </HubPillButton>
        <HubPillButton
          aria-label="Next week"
          analyticsSurface="calendar"
          analyticsLabel="Admin debate calendar Next week"
          disabled={weekOffset >= CALENDAR_WEEKS - 1}
          onClick={() => goToWeek(weekOffset + 1)}
          className="w-7 px-0"
        >
          ›
        </HubPillButton>
        <Text as="span" variant="listSemibold" className="px-1" aria-live="polite">
          {weekRangeLabel(days)}
        </Text>
        <HubPillButton
          analyticsSurface="calendar"
          analyticsLabel="Admin debate calendar Needs attention"
          aria-pressed={attentionOnly}
          variant={attentionOnly ? 'primary' : 'secondary'}
          onClick={() => setAttentionOnly(current => !current)}
        >
          Needs attention{admin.data ? ` (${attentionCount})` : ''}
        </HubPillButton>
        <span className="flex-1" />
        <AdminDebatesLegend />
        {isPhone ? (
          <Text as="span" variant="footnote" color="grey-04">
            {offsets.join(' / ')}
          </Text>
        ) : null}
      </div>

      <Text as="p" variant="footnote" color="grey-04" className="px-6 pb-2 md:px-4">
        Admin view. Only allowlisted admins can see other people&rsquo;s scheduled debates.
        {admin.truncated ? ` Showing the first ${admin.data?.matches.length ?? 0}; later debates are cut off.` : ''}
      </Text>

      <div className="px-6 pb-6 md:px-4">
        <HubQueryState
          analyticsSurface="calendar"
          isLoading={admin.isPending}
          loadingFallback={<CalendarWeekSkeleton />}
          error={admin.data ? null : admin.error}
          failureReason={admin.failureReason}
          onRetry={() => void admin.refetch()}
          isEmpty={thisWeek.length === 0}
          emptyMessage={attentionOnly ? 'Nothing needs attention this week.' : 'No debates scheduled this week.'}
          emptyAction={
            attentionOnly
              ? { label: 'Show all', onClick: () => setAttentionOnly(false) }
              : weekOffset < CALENDAR_WEEKS - 1
                ? { label: 'Next week', onClick: () => goToWeek(weekOffset + 1) }
                : undefined
          }
        >
          {isPhone ? (
            <AdminDebatesDayList days={days} debates={thisWeek} nameOf={nameOf} />
          ) : (
            <AdminDebatesWeek key={days[0].getTime()} days={days} debates={thisWeek} nameOf={nameOf} now={now} />
          )}
        </HubQueryState>
      </div>
    </div>
  );
}
