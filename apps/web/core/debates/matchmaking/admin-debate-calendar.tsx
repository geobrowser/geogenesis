'use client';

import * as Popover from '@radix-ui/react-popover';

import * as React from 'react';

import cx from 'classnames';
import Link from 'next/link';

import { normId } from '~/core/utils/norm-id';
import { NavUtils, validateSpaceId } from '~/core/utils/utils';

import { Avatar } from '~/design-system/avatar';
import { Time } from '~/design-system/icons/time';
import { Text } from '~/design-system/text';

import type { DebateParticipantSummary } from '../api';
import { speakerLabel } from '../playback-utils';
import type { useAdminScheduledDebates } from '../rooms/scheduling-hooks';
import {
  ANSWER_LABELS,
  type AdminDebate,
  type AdminDebater,
  DEFAULT_SHOWN_STATES,
  type DebaterAnswer,
  MATCH_STATES,
  MATCH_STATE_LABELS,
  type MatchState,
  ROLE_LABELS,
  adminDebates,
  adminDebatesByCell,
  blockLabel,
  countByState,
  dayShift,
  matchSentence,
  showsOffHours,
  timeIn,
  zoneCity,
} from './admin-debate-calendar-model';
import { useAdminDebaters } from './admin-hooks';
import { AdminNewMatchDialog } from './admin-new-match-dialog';
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

/** Names, first names and zones for the debaters on the calendar, from one lookup each. */
type Debaters = {
  nameOf: (userId: string) => DebateParticipantSummary | null;
  firstNameOf: (userId: string) => string;
  timezoneOf: (userId: string) => string | undefined;
};

/** One look per state, shared by the blocks, the legend's swatches and the card's chip. */
const STATE_CLASS_NAMES: Record<MatchState, string> = {
  confirmed: 'border-green bg-successTertiary',
  waiting: 'border-orange bg-orange/15',
  noreply: 'border-dashed border-grey-03 bg-white',
  declined: 'border-red-01 bg-red-02',
  closed: 'border-grey-02 bg-grey-01',
};

/** The state word on a block, darkened so it reads on its own fill. */
const STATE_LABEL_CLASS_NAMES: Record<MatchState, string> = {
  confirmed: 'text-[#0b7a59]',
  waiting: 'text-[#a45a00]',
  noreply: 'text-grey-04',
  declined: 'text-[#c62f19]',
  closed: 'text-grey-04',
};

const ANSWER_CLASS_NAMES: Record<DebaterAnswer, string> = {
  sent: 'bg-grey-01 text-text',
  accepted: 'bg-successTertiary text-[#0b7a59]',
  declined: 'bg-red-02 text-[#c62f19]',
  pending: 'bg-orange/15 text-[#a45a00]',
  no_answer: 'bg-grey-01 text-grey-04',
};

/** Shown on a match that is still open and was booked outside someone's availability. */
function OffHoursTag() {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 self-start rounded-full bg-purple/10 px-1.5 py-px text-footnoteMedium whitespace-nowrap text-purple">
      <Time />
      Off-hours
    </span>
  );
}

function pairLabel(debate: AdminDebate, debaters: Debaters) {
  return debate.debaters.map(debater => debaters.firstNameOf(debater.userId)).join(' vs ');
}

/**
 * The legend, which is also the filter: each state with how many debates this week are in it,
 * pressed to show them. Closed starts unpressed, since nothing in it needs an admin.
 */
export function AdminDebatesLegend({
  counts,
  shown,
  onToggle,
}: {
  counts: Record<MatchState, number>;
  shown: ReadonlySet<MatchState>;
  onToggle: (state: MatchState) => void;
}) {
  return (
    <div role="group" aria-label="Show debates by state" className="flex flex-wrap gap-1.5">
      {MATCH_STATES.map(state => {
        const pressed = shown.has(state);
        return (
          <button
            key={state}
            type="button"
            aria-pressed={pressed}
            onClick={() => onToggle(state)}
            className={cx(
              'inline-flex h-7 items-center gap-2 rounded-full border border-grey-02 bg-white pr-2.5 pl-2 text-metadata transition-colors hover:bg-grey-01',
              !pressed && 'text-grey-04'
            )}
          >
            <span
              aria-hidden
              className={cx('h-3 w-5 shrink-0 rounded-sm border', STATE_CLASS_NAMES[state], !pressed && 'opacity-35')}
            />
            {MATCH_STATE_LABELS[state]}
            <span className={cx('font-medium tabular-nums', pressed ? 'text-text' : 'text-grey-04')}>
              {counts[state]}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * The admin calendar's week (GEO-2943): every scheduled debate in its hour, in its state's look. A
 * block opens the match's card.
 *
 * Read-only. Acting on a match (resend, reschedule, cancel) needs geo-chat work and comes later.
 */
export function AdminDebatesWeek({
  days,
  debates,
  debaters,
  now,
}: {
  days: Date[];
  debates: AdminDebate[];
  debaters: Debaters;
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
                      <AdminDebateBlock key={debate.requestId} debate={debate} debaters={debaters} />
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

function AdminDebateBlock({ debate, debaters }: { debate: AdminDebate; debaters: Debaters }) {
  const pair = pairLabel(debate, debaters);
  const label = blockLabel(debate, debaters.firstNameOf);
  const struck = debate.state === 'declined' || debate.state === 'closed';
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={`${timeRangeLabel(debate.start, debate.end)}, ${pair}, ${label}${
            showsOffHours(debate) ? ', outside availability' : ''
          }`}
          className={cx(
            'flex w-full min-w-0 flex-col gap-px rounded-md border px-2 py-1 text-left text-footnote transition-shadow hover:shadow-inner-text data-[state=open]:shadow-inner-text',
            STATE_CLASS_NAMES[debate.state],
            debate.state === 'closed' ? 'text-grey-04' : 'text-text'
          )}
        >
          <span className="font-medium tabular-nums">{timeRangeLabel(debate.start, debate.end)}</span>
          <span className={cx('truncate', struck && 'line-through')}>{pair}</span>
          <span className={cx('truncate font-medium', STATE_LABEL_CLASS_NAMES[debate.state])}>{label}</span>
          {showsOffHours(debate) ? <OffHoursTag /> : null}
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
          <AdminDebateDetails debate={debate} debaters={debaters} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/**
 * Everything the calendar knows about one match: when, its state in a sentence, and for each
 * debater how they came to be in it, their own answer, and the time it is for them.
 */
export function AdminDebateDetails({ debate, debaters }: { debate: AdminDebate; debaters: Debaters }) {
  const when = new Date(debate.start).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  const notes: { key: string; text: string; tone: 'quiet' | 'warn' }[] = [];
  if (debate.createdByAdmin) notes.push({ key: 'admin', text: 'Arranged by an admin.', tone: 'quiet' });
  if (debate.rescheduleCount > 0) {
    notes.push({
      key: 'moved',
      text: `Moved ${debate.rescheduleCount === 1 ? 'once' : `${debate.rescheduleCount} times`}.`,
      tone: 'quiet',
    });
  }
  if (debate.outsideAvailability) {
    notes.push({
      key: 'outside',
      text: showsOffHours(debate)
        ? 'Booked outside at least one debater’s availability, so a decline is more likely.'
        : 'Booked outside at least one debater’s availability.',
      tone: 'warn',
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <Text as="p" variant="metadataMedium" className="tabular-nums">
            {when} · {timeRangeLabel(debate.start, debate.end)}
          </Text>
          <Text as="p" variant="footnote" color="grey-04">
            Your time
          </Text>
        </div>
        <span
          className={cx(
            'shrink-0 rounded-full border px-2 py-0.5 text-footnoteMedium whitespace-nowrap',
            STATE_CLASS_NAMES[debate.state]
          )}
        >
          {blockLabel(debate, debaters.firstNameOf)}
        </span>
      </div>
      <Text as="p" variant="metadata">
        {matchSentence(debate, debaters.firstNameOf)}
      </Text>
      <ul className="flex flex-col gap-2.5">
        {debate.debaters.map(debater => (
          <DebaterRow key={debater.userId} debater={debater} start={debate.start} debaters={debaters} />
        ))}
      </ul>
      {notes.length > 0 ? (
        <div className="flex flex-col gap-1 border-t border-divider pt-2.5">
          {notes.map(note => (
            <Text
              key={note.key}
              as="p"
              variant="footnote"
              className={note.tone === 'warn' ? 'text-purple' : 'text-grey-04'}
            >
              {note.text}
            </Text>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function DebaterRow({ debater, start, debaters }: { debater: AdminDebater; start: number; debaters: Debaters }) {
  const summary = debaters.nameOf(debater.userId);
  const name = summary ? speakerLabel(summary) : 'Someone';
  const href = summary && validateSpaceId(summary.profile_space_id) ? NavUtils.toSpace(summary.profile_space_id) : null;
  const timezone = debaters.timezoneOf(debater.userId);
  const local = timezone ? ` · ${timeIn(start, timezone)} in ${zoneCity(timezone)}${dayShift(start, timezone)}` : '';
  return (
    <li className="grid grid-cols-[1.75rem_minmax(0,1fr)_auto] items-center gap-2">
      {/* An image avatar fills its parent, so the box sets the size; `size` only reaches the generated one. */}
      <div className="h-7 w-7 shrink-0 overflow-hidden rounded-full">
        <Avatar avatarUrl={summary?.avatar_cid ?? null} value={summary?.profile_space_id ?? debater.userId} size={28} />
      </div>
      <div className="flex min-w-0 flex-col">
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
          {local}
        </Text>
      </div>
      <span
        className={cx(
          'rounded-full px-2 py-0.5 text-footnoteMedium whitespace-nowrap',
          ANSWER_CLASS_NAMES[debater.answer]
        )}
      >
        {ANSWER_LABELS[debater.answer]}
      </span>
    </li>
  );
}

/** The admin calendar on a phone: the week's matches grouped by day, each card open inline. */
export function AdminDebatesDayList({
  days,
  debates,
  debaters,
}: {
  days: Date[];
  debates: AdminDebate[];
  debaters: Debaters;
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
                <li key={debate.requestId} className="rounded-lg border border-grey-02 p-3">
                  <AdminDebateDetails debate={debate} debaters={debaters} />
                </li>
              ))}
            </ul>
          </section>
        ))}
    </div>
  );
}

/** Names, first names and zones for a set of debaters, keyed by geo-chat user id. */
export function useDebaters(userIds: string[], timezoneByUser: ReadonlyMap<string, string>): Debaters {
  const summaries = useGeoChatUserSummaries(userIds, userIds.length > 0);
  return React.useMemo(() => {
    const byUser = new Map(summaries.map(summary => [normId(summary.user_id), summary]));
    const nameOf = (userId: string) => byUser.get(normId(userId)) ?? null;
    return {
      nameOf,
      firstNameOf: (userId: string) => {
        const known = nameOf(userId);
        // A display name is the person's own; a bare space id is no one's first name.
        return known?.display_name ? (known.display_name.trim().split(/\s+/)[0] ?? 'Someone') : 'Someone';
      },
      timezoneOf: (userId: string) => timezoneByUser.get(normId(userId)),
    };
  }, [summaries, timezoneByUser]);
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
 * The admin half of the debate calendar (GEO-2942, GEO-2943): every scheduled debate this week and
 * next, in any status, each debater's own answer, and New match to pair two debaters. Shown only
 * once geo-chat has served the admin list, so a viewer off its allowlist never reaches it.
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
  const [shown, setShown] = React.useState<ReadonlySet<MatchState>>(DEFAULT_SHOWN_STATES);
  const [newMatchOpen, setNewMatchOpen] = React.useState(false);
  const [sentNote, setSentNote] = React.useState<string | null>(null);
  const newMatchButtonRef = React.useRef<HTMLButtonElement | null>(null);

  const days = React.useMemo(() => weekDays(weekStart(new Date(now), weekOffset)), [now, weekOffset]);
  const all = React.useMemo(() => adminDebates(admin.data?.matches), [admin.data]);
  const thisWeek = React.useMemo(() => all.filter(debate => cellOf(debate.start, days) !== null), [all, days]);
  const counts = React.useMemo(() => countByState(thisWeek), [thisWeek]);
  const visible = React.useMemo(() => thisWeek.filter(debate => shown.has(debate.state)), [shown, thisWeek]);

  const { timezoneByUser } = useAdminDebaters(true);
  const userIds = React.useMemo(
    () => [...new Set(all.flatMap(debate => debate.debaters.map(debater => debater.userId)))],
    [all]
  );
  const debaters = useDebaters(userIds, timezoneByUser);

  const goToWeek = (next: number) => setWeekOffset(Math.max(0, Math.min(CALENDAR_WEEKS - 1, next)));
  const toggle = (state: MatchState) =>
    setShown(current => {
      const next = new Set(current);
      if (next.has(state)) next.delete(state);
      else next.add(state);
      return next;
    });
  const showAll = () => setShown(new Set(MATCH_STATES));
  const hiddenCount = thisWeek.length - visible.length;
  const offsets = weekOffsetLabels(days);

  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-center gap-2 px-6 pt-3 pb-2 md:px-4">
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
        {isPhone ? (
          <Text as="span" variant="footnote" color="grey-04">
            {offsets.join(' / ')}
          </Text>
        ) : null}
        <span className="flex-1" />
        <HubPillButton
          ref={newMatchButtonRef}
          analyticsSurface="calendar"
          analyticsLabel="Admin debate calendar New match"
          variant="primary"
          onClick={() => {
            setSentNote(null);
            setNewMatchOpen(true);
          }}
        >
          New match
        </HubPillButton>
      </div>

      <div className="flex flex-col gap-2 px-6 pb-3 md:px-4">
        <AdminDebatesLegend counts={counts} shown={shown} onToggle={toggle} />
        <Text as="p" variant="footnote" color="grey-04">
          Admin view. Only allowlisted admins can see other people&rsquo;s scheduled debates.
          {admin.truncated ? ` Showing the first ${admin.data?.matches.length ?? 0}; later debates are cut off.` : ''}
        </Text>
        {/* A live region that is always mounted, so the note is announced when it arrives. */}
        <div role="status">
          {sentNote ? (
            <Text as="p" variant="metadata">
              {sentNote}
            </Text>
          ) : null}
        </div>
      </div>

      <div className="px-6 pb-6 md:px-4">
        <HubQueryState
          analyticsSurface="calendar"
          isLoading={admin.isPending}
          loadingFallback={<CalendarWeekSkeleton />}
          error={admin.data ? null : admin.error}
          failureReason={admin.failureReason}
          onRetry={() => void admin.refetch()}
          isEmpty={visible.length === 0}
          emptyMessage={
            hiddenCount > 0
              ? `${hiddenCount} ${hiddenCount === 1 ? 'debate is' : 'debates are'} hidden by the state filter.`
              : 'No debates scheduled this week.'
          }
          emptyAction={
            hiddenCount > 0
              ? { label: 'Show all', onClick: showAll }
              : weekOffset < CALENDAR_WEEKS - 1
                ? { label: 'Next week', onClick: () => goToWeek(weekOffset + 1) }
                : undefined
          }
        >
          {isPhone ? (
            <AdminDebatesDayList days={days} debates={visible} debaters={debaters} />
          ) : (
            <AdminDebatesWeek key={days[0].getTime()} days={days} debates={visible} debaters={debaters} now={now} />
          )}
        </HubQueryState>
      </div>

      <AdminNewMatchDialog
        open={newMatchOpen}
        onOpenChange={setNewMatchOpen}
        openerRef={newMatchButtonRef}
        onSent={note => setSentNote(note)}
      />
    </div>
  );
}
