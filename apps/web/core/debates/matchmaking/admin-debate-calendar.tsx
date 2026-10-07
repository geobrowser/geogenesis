'use client';

import * as Popover from '@radix-ui/react-popover';

import * as React from 'react';

import cx from 'classnames';
import Link from 'next/link';

import { normId } from '~/core/utils/norm-id';
import { NavUtils, validateSpaceId } from '~/core/utils/utils';

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
import {
  DebaterFace,
  NEGATIVE_TEXT_CLASS,
  POSITIVE_TEXT_CLASS,
  WAITING_TEXT_CLASS,
  debaterFirstName,
} from './admin-debate-parts';
import { useAdminDebaters } from './admin-hooks';
import { AdminNewMatchDialog } from './admin-new-match-dialog';
import { CalendarWeekNav, SegmentedControl, useMinuteClock } from './debate-calendar-controls';
import {
  CALENDAR_WEEKS,
  DAYS_IN_WEEK,
  cellKey,
  cellOf,
  dayListLabel,
  firstBusyHour,
  hourLabel,
  hourStart,
  timeRangeLabel,
  weekDays,
  weekStart,
} from './debate-calendar-model';
import { CalendarWeekFrame, CalendarWeekSkeleton, NowLine } from './debate-calendar-week';
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
  confirmed: POSITIVE_TEXT_CLASS,
  waiting: WAITING_TEXT_CLASS,
  noreply: 'text-grey-04',
  declined: NEGATIVE_TEXT_CLASS,
  closed: 'text-grey-04',
};

const ANSWER_CLASS_NAMES: Record<DebaterAnswer, string> = {
  sent: 'bg-grey-01 text-text',
  accepted: cx('bg-successTertiary', POSITIVE_TEXT_CLASS),
  declined: cx('bg-red-02', NEGATIVE_TEXT_CLASS),
  pending: cx('bg-orange/15', WAITING_TEXT_CLASS),
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
  const byCell = React.useMemo(() => adminDebatesByCell(debates, days), [days, debates]);
  const nowCell = cellOf(now, days);

  return (
    <CalendarWeekFrame
      days={days}
      now={now}
      firstBusy={firstBusyHour(byCell, [], days)}
      role="table"
      ariaLabel="Scheduled debates each hour this week"
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
            <CellDebates debates={byCell.get(key) ?? []} debaters={debaters} date={date} hour={hour} />
          </div>
        );
      }}
    />
  );
}

/** Compact blocks drawn in a busy hour before the rest collapse into "+N more". */
const BLOCKS_PER_BUSY_CELL = 2;

/**
 * An hour's debates. One gets the full block; two or more go compact, one line each, so a busy
 * hour keeps its row height instead of pushing the rest of the day down. Past two, the rest
 * collapse into "+N more", which lists the whole hour, as the availability grid's "+N" does.
 */
function CellDebates({
  debates,
  debaters,
  date,
  hour,
}: {
  debates: AdminDebate[];
  debaters: Debaters;
  date: Date;
  hour: number;
}) {
  if (debates.length === 0) return null;
  if (debates.length === 1) return <AdminDebateBlock debate={debates[0]} debaters={debaters} />;
  // Two compact lines and the "+N more" link fit in the row's resting height.
  const shown = debates.slice(0, BLOCKS_PER_BUSY_CELL);
  const hidden = debates.length - shown.length;
  return (
    <>
      {shown.map(debate => (
        <AdminDebateBlock key={debate.requestId} debate={debate} debaters={debaters} compact />
      ))}
      {hidden > 0 ? (
        <HourDebates debates={debates} hidden={hidden} debaters={debaters} date={date} hour={hour} />
      ) : null}
    </>
  );
}

function blockName(debate: AdminDebate, debaters: Debaters) {
  return `${timeRangeLabel(debate.start, debate.end)}, ${pairLabel(debate, debaters)}, ${blockLabel(
    debate,
    debaters.firstNameOf
  )}${showsOffHours(debate) ? ', outside availability' : ''}`;
}

function AdminDebateBlock({
  debate,
  debaters,
  compact = false,
}: {
  debate: AdminDebate;
  debaters: Debaters;
  /** One line, for an hour holding more than one: the state reads from the fill and border. */
  compact?: boolean;
}) {
  const pair = pairLabel(debate, debaters);
  const label = blockLabel(debate, debaters.firstNameOf);
  const struck = debate.state === 'declined' || debate.state === 'closed';
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={blockName(debate, debaters)}
          // The full label is in the name and the card; a pointer gets it on hover too.
          title={compact ? `${pair} · ${label}` : undefined}
          className={cx(
            'flex w-full min-w-0 rounded-md border px-2 text-left text-footnote transition-shadow hover:shadow-inner-text data-[state=open]:shadow-inner-text',
            compact ? 'items-center gap-1 py-0.5' : 'flex-col gap-px py-1',
            STATE_CLASS_NAMES[debate.state],
            debate.state === 'closed' ? 'text-grey-04' : 'text-text'
          )}
        >
          {compact ? (
            <>
              <span className="shrink-0 font-medium tabular-nums">{timeIn(debate.start, undefined)}</span>
              <span className={cx('min-w-0 flex-1 truncate', struck && 'line-through')}>{pair}</span>
              {showsOffHours(debate) ? (
                <span aria-hidden className="shrink-0 text-purple">
                  <Time />
                </span>
              ) : null}
            </>
          ) : (
            <>
              <span className="font-medium tabular-nums">{timeRangeLabel(debate.start, debate.end)}</span>
              <span className={cx('truncate', struck && 'line-through')}>{pair}</span>
              <span className={cx('truncate font-medium', STATE_LABEL_CLASS_NAMES[debate.state])}>{label}</span>
              {showsOffHours(debate) ? <OffHoursTag /> : null}
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
 * "+N more" and the list it opens: every debate in the hour, a row each with its time, pair and
 * state. A row opens that match's card in place, with a way back to the list.
 */
function HourDebates({
  debates,
  hidden,
  debaters,
  date,
  hour,
}: {
  debates: AdminDebate[];
  hidden: number;
  debaters: Debaters;
  date: Date;
  hour: number;
}) {
  const [open, setOpen] = React.useState(false);
  const [openId, setOpenId] = React.useState<string | null>(null);
  const current = debates.find(debate => debate.requestId === openId) ?? null;
  const heading = `${date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}, ${hourLabel(hour)}`;
  return (
    <Popover.Root
      open={open}
      onOpenChange={next => {
        setOpen(next);
        if (!next) setOpenId(null);
      }}
    >
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={`All ${debates.length} debates at ${heading}`}
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
          aria-label={
            current ? `${pairLabel(current, debaters)}, ${timeRangeLabel(current.start, current.end)}` : heading
          }
          className="z-100 flex max-h-[min(36rem,calc(100vh-6rem))] w-[340px] max-w-[calc(100vw-32px)] flex-col overflow-y-auto rounded-xl border border-grey-02 bg-white p-4 shadow-lg"
        >
          {current ? (
            <div className="flex flex-col gap-3">
              <button
                type="button"
                onClick={() => setOpenId(null)}
                className="self-start text-footnoteMedium text-grey-04 transition-colors hover:text-text"
              >
                ‹ All at {hourLabel(hour)}
              </button>
              <AdminDebateDetails debate={current} debaters={debaters} />
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <Text as="p" variant="metadataMedium">
                {heading}
              </Text>
              <Text as="p" variant="footnote" color="grey-04">
                {debates.length} debates this hour
              </Text>
              <ul className="flex flex-col">
                {debates.map(debate => (
                  <li key={debate.requestId} className="border-b border-grey-02 last:border-b-0">
                    <button
                      type="button"
                      aria-label={blockName(debate, debaters)}
                      onClick={() => setOpenId(debate.requestId)}
                      className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 py-2 text-left hover:bg-grey-01"
                    >
                      <Text as="span" variant="footnote" className="tabular-nums">
                        {timeIn(debate.start, undefined)}
                      </Text>
                      <Text
                        as="span"
                        variant="metadata"
                        className={cx(
                          'truncate',
                          (debate.state === 'declined' || debate.state === 'closed') && 'text-grey-04 line-through'
                        )}
                      >
                        {pairLabel(debate, debaters)}
                      </Text>
                      <span
                        className={cx(
                          'rounded-full border px-2 py-0.5 text-footnoteMedium whitespace-nowrap',
                          STATE_CLASS_NAMES[debate.state]
                        )}
                      >
                        {blockLabel(debate, debaters.firstNameOf)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
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
      <DebaterFace summary={summary} fallbackId={debater.userId} size={28} />
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
    const today = new Date();
    return days.slice(0, DAYS_IN_WEEK).map((date, day) => {
      return {
        key: date.getTime(),
        label: dayListLabel(date, today),
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
      firstNameOf: (userId: string) => debaterFirstName(nameOf(userId)),
      timezoneOf: (userId: string) => timezoneByUser.get(normId(userId)),
    };
  }, [summaries, timezoneByUser]);
}

export type CalendarView = 'availability' | 'debates';

const VIEW_OPTIONS = [
  { value: 'availability', label: 'Availability' },
  { value: 'debates', label: 'Debates' },
] as const;

/** Availability | Debates. Rendered only for an admin; everyone else has one view and no switch. */
export function CalendarViewSwitch({ view, onChange }: { view: CalendarView; onChange: (view: CalendarView) => void }) {
  return <SegmentedControl label="Calendar view" options={VIEW_OPTIONS} value={view} onChange={onChange} />;
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
  const now = useMinuteClock();
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
  return (
    <div className="flex flex-col">
      <CalendarWeekNav
        days={days}
        weekOffset={weekOffset}
        onGoToWeek={goToWeek}
        isPhone={isPhone}
        analyticsLabelPrefix="Admin debate calendar"
      >
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
      </CalendarWeekNav>

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
