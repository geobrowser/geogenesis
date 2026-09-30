'use client';

import * as React from 'react';

import cx from 'classnames';

import {
  type PeerDay,
  type PeerDaySlot,
  type PeerSchedule,
  formatOffset,
  formatViewerInstant,
  peerScheduleDays,
  viewerInputInstant,
  viewerInputValue,
} from '~/core/availability/peer-schedule';
import { type ScheduleEntry, debateAvailabilityViewed } from '~/core/availability/schedule-analytics';
import { usePeerSchedule } from '~/core/debates/hooks';
import { debateActionAnalyticsAttributes } from '~/core/debates/matchmaking/hub-analytics';
import { useEffectOnceWhen } from '~/core/hooks/use-effect-once';

import { Text } from '~/design-system/text';

import { firstName } from '~/partials/profile/claim-response-tag';

/**
 * How many slots a day shows before the expander.
 *
 * A normally available week is around sixteen a day, and sixteen chips in a column is a wall
 * rather than a week. Four is the prototype's number and is the first thing to revisit if it
 * reads wrong against real schedules.
 */
const SLOTS_PER_DAY = 4;

/**
 * Chip looks, shared with the legend so the key can never drift from what it describes. Green for
 * a time you both have free, since that is the one worth picking; dashed for theirs alone.
 */
export const MUTUAL_SLOT = 'border-solid border-green bg-successTertiary text-text';
export const PEER_ONLY_SLOT = 'border-dashed border-grey-03 bg-white text-text';
export const SELECTED_SLOT = 'border-solid border-text bg-text text-white';

/**
 * Supplied by a caller that can act on a picked time, which turns the footer on. Absent, the week
 * stays read-only and no CTA renders.
 */
export type PeerAvailabilityBooking = {
  /**
   * `reschedule` moves an existing request rather than proposing one (a scheduling email's "Choose
   * different time"). Only the wording changes; the caller decides what `onRequest` does.
   */
  mode?: 'request' | 'reschedule';
  /**
   * An instant, not a chip: a week with no slots is still requestable (GEO-2938). `viewerIsFree` is
   * the picked chip's, for analytics; `null` for a time typed in by hand. `viewerTimezone` is the
   * zone the week was drawn in, so whatever confirms the pick names it the way the chip did.
   */
  onRequest: (startsAt: string, pick: { viewerIsFree: boolean | null; viewerTimezone: string }) => void;
  pending: boolean;
  error: string | null;
};

/**
 * What a sent request says. The caller closes the week on success, so this is shown by whoever
 * confirms it — in the grid's zone, like every other time here, so it cannot contradict the chip.
 */
export function requestSentMessage({
  mode = 'request',
  startsAt,
  peerName,
  viewerTimezone,
}: {
  mode?: PeerAvailabilityBooking['mode'];
  startsAt: string;
  peerName: string;
  viewerTimezone: string | undefined;
}) {
  const requested = formatViewerInstant(startsAt, viewerTimezone);
  return mode === 'reschedule'
    ? `Proposed ${requested} instead. ${peerName} has to accept the new time before the room is booked.`
    : `Requested ${requested}. ${peerName} has to accept before the room is booked.`;
}

/**
 * Another person's availability (GEO-2938).
 *
 * ## It shows their week, not the overlap
 *
 * The grid is *their* availability; the viewer's own picks green over dashed, never whether a
 * slot appears. Intersecting would leave a shared-link recipient with no schedule of their own
 * seeing nothing, which is the case this exists for.
 *
 * ## Read-only unless a caller can book
 *
 * `booking` adds the footer that turns a picked slot into a scheduled debate (GEO-2941). Without
 * it the week is a week and no CTA renders.
 *
 * Takes a user id and nothing else, so the shareable link that will eventually open this can
 * mount it without this component knowing anything about routing.
 */
export function PeerAvailability({
  userId,
  peerName,
  className,
  booking,
  initialSelectedStart,
  entry = null,
  disagreementCount = null,
}: Props) {
  const { schedule, enabled, isPending, isError } = usePeerSchedule(userId);

  // Once per opening: the modal mounts this only while open, and a refetch is not a second look.
  useEffectOnceWhen(schedule !== undefined, () => {
    if (schedule) debateAvailabilityViewed(schedule, { entry, bookable: Boolean(booking) });
  });

  // Signed out there is no viewer to compare against, so the question cannot be asked rather than
  // having failed — a distinction worth drawing, since one of these is fixable by signing in.
  if (!enabled) return <Notice className={className}>Sign in to see when someone is free.</Notice>;
  if (isPending) return <Notice className={className}>Loading availability…</Notice>;
  if (isError || !schedule) return <Notice className={className}>Couldn&rsquo;t load their availability.</Notice>;

  return (
    <PeerAvailabilityView
      schedule={schedule}
      peerName={peerName}
      className={className}
      booking={booking}
      initialSelectedStart={initialSelectedStart}
      disagreementCount={disagreementCount}
    />
  );
}

type Props = {
  userId: string;
  booking?: PeerAvailabilityBooking;
  /**
   * The endpoint answers with a user id and a zone, not a name, and the roster that has names only
   * covers people who are online. Supplied by whoever already knows it; the id is the fallback.
   */
  peerName?: string | null;
  className?: string;
  /** A slot picked before the week opened, e.g. a time chip on a People tab row. */
  initialSelectedStart?: string | null;
  /** What opened this week, for analytics. */
  entry?: ScheduleEntry | null;
  /**
   * Claims the viewer and this person hold opposite positions on. Supplied by a caller that has
   * already compared them; `null` when nobody has, which leaves the count out of the line.
   */
  disagreementCount?: number | null;
};

/**
 * The same view over a schedule already in hand — what the tests and the debug page render, and
 * what keeps every decision below testable without a query client.
 */
export function PeerAvailabilityView({
  schedule,
  peerName,
  className,
  now,
  booking,
  initialSelectedStart = null,
  disagreementCount = null,
}: {
  schedule: PeerSchedule;
  peerName?: string | null;
  className?: string;
  /** Pins the week. Tests pass it; nothing in the app does. */
  now?: Date;
  booking?: PeerAvailabilityBooking;
  initialSelectedStart?: string | null;
  disagreementCount?: number | null;
}) {
  // The week starts at today's midnight, so its early slots are already gone. They are dropped
  // rather than dimmed: a time nobody can pick is not information about their week, and geo-chat
  // refuses a past start anyway. Drawn once per opening; `SendRequest` rechecks at the click.
  const clock = React.useCallback(() => (now ? now.getTime() : Date.now()), [now]);
  const days = React.useMemo(() => {
    const cutoff = clock();
    return peerScheduleDays(schedule, now).map(day => ({
      ...day,
      slots: day.slots.filter(slot => Date.parse(slot.start) > cutoff),
    }));
  }, [schedule, now, clock]);
  // One pick per week, held here rather than per chip: two selected times is not a thing anyone
  // can ask for, and the footer needs to name the one that is.
  // Matched by instant, not spelling: the wire sends `…:00Z` and the grid's starts are `…:00.000Z`.
  // A pick outside the drawn week seeds nothing rather than a selection nobody can see.
  const [selectedStart, setSelectedStart] = React.useState<string | null>(() => {
    if (!initialSelectedStart) return null;
    // A chip can outlive its time; `days` has already dropped it, so a past pick seeds nothing.
    const instant = Date.parse(initialSelectedStart);
    return days.flatMap(day => day.slots).find(slot => Date.parse(slot.start) === instant)?.start ?? null;
  });
  const selectedSlot = days.flatMap(day => day.slots).find(slot => slot.start === selectedStart) ?? null;
  // For the free-time field, whose `min` is the only thing keeping a past time out of it.
  const notBefore = clock();
  const name = peerDisplayName(peerName, schedule.userId);
  const hasAnySlot = days.some(day => day.slots.length > 0);

  // A week crossing a DST boundary holds two genuinely different offsets, so the header names one
  // only when every slot agrees. This line is the only place their zone appears: every time in the
  // modal is the viewer's own, since a second clock on each chip read as noise.
  const offsets = new Set(days.flatMap(day => day.slots).map(slot => slot.offsetMinutes));
  const uniformOffset = offsets.size === 1 ? [...offsets][0] : null;
  // geo-chat sends an empty zone for a side with no saved schedule, so naming them is conditional —
  // "Ada is in ," otherwise.
  const zoneNote =
    schedule.viewerTimezone && schedule.peerTimezone
      ? `Times shown in your zone, ${schedule.viewerTimezone}. ${name} is in ${schedule.peerTimezone}${
          uniformOffset === null ? '' : `, ${formatOffset(uniformOffset)}`
        }.`
      : 'Times shown in your local time.';
  const week = !schedule.theirWeekKnown ? 'unknown' : !schedule.peerHasSchedule || !hasAnySlot ? 'empty' : 'slots';
  // A bookable week carries the zone in its footer, beside Send. Every other state has no footer,
  // so it gets the line on its own at the bottom.
  const zoneInFooter = Boolean(booking) && week === 'slots';

  return (
    <div className={cx('flex min-h-0 flex-col gap-4', className)}>
      {/* Right padding keeps the heading clear of the modal's close button, which sits over it. */}
      <header className="flex shrink-0 flex-col gap-1 pr-8">
        <Text as="h2" variant="smallTitle">
          When {name} is free
        </Text>
        {/* Scheduling is with the person, not over one claim: the room is where they pick which to
            debate first, so the viewer only has to find a time. The count leads only when there is
            one to give; zero or still loading, the room half stands on its own. */}
        <Text as="p" variant="metadata" color="grey-04">
          {disagreementCount !== null && disagreementCount > 0
            ? `You and ${firstName(name) ?? name} disagree on ${disagreementCount} ${
                disagreementCount === 1 ? 'claim' : 'claims'
              }. `
            : null}
          When you join the debate room, you can discuss what claim to debate first.
        </Text>
      </header>

      {week === 'unknown' ? (
        // An older geo-chat cannot send their week at all, and its intersection says nothing
        // about them. Better to say so than to report an empty week as theirs.
        <Empty>Can&rsquo;t show {name}&rsquo;s week from this server yet.</Empty>
      ) : week === 'empty' ? (
        // Availability is a preference, not a gate, so a caller that can book is offered a time of
        // its own rather than a wall (GEO-2938).
        <Empty
          action={
            booking && (
              <RequestAnyway
                booking={booking}
                clock={clock}
                viewerTimezone={schedule.viewerTimezone}
                notBefore={notBefore}
              />
            )
          }
        >
          {schedule.peerHasSchedule
            ? `${name} has no times free in the next 7 days.`
            : `${name} hasn’t set any availability yet.`}
        </Empty>
      ) : (
        <>
          {/* Informational, never a gate. Only beside a week, since it offers to annotate one. */}
          {!schedule.viewerHasSchedule && (
            <Hint>
              You haven&rsquo;t set your own availability. You can still see {name}&rsquo;s; setting yours just marks
              the times you both have free.
            </Hint>
          )}
          <Legend peerName={name} showMutual={schedule.viewerHasSchedule} />
          <WeekGrid days={days} peerName={name} selectedStart={selectedStart} onSelect={setSelectedStart} />
          {booking && (
            <BookingFooter
              booking={booking}
              clock={clock}
              startsAt={selectedStart}
              viewerIsFree={selectedSlot?.viewerIsFree ?? null}
              viewerTimezone={schedule.viewerTimezone}
              zoneNote={zoneNote}
            />
          )}
        </>
      )}
      {!zoneInFooter && (
        <Text as="p" variant="footnote" color="grey-04" className="shrink-0">
          {zoneNote}
        </Text>
      )}
    </div>
  );
}

/** Only rendered for a caller that can act on the pick, so there is never a dead CTA here. */
function BookingFooter({
  booking,
  clock,
  startsAt,
  viewerIsFree,
  viewerTimezone,
  zoneNote,
}: {
  booking: PeerAvailabilityBooking;
  clock: () => number;
  startsAt: string | null;
  viewerIsFree: boolean | null;
  viewerTimezone: string;
  /** Which zone the grid is in, shown until a pick replaces it with the picked time. */
  zoneNote: string;
}) {
  return (
    <div className="flex shrink-0 flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <Text as="span" variant="footnote" color="grey-04" className="min-w-0">
          {startsAt ? formatViewerInstant(startsAt, viewerTimezone) : zoneNote}
        </Text>
        <SendRequest
          booking={booking}
          clock={clock}
          startsAt={startsAt}
          viewerIsFree={viewerIsFree}
          viewerTimezone={viewerTimezone}
        />
      </div>

      {/* A slot outside your own week is a one-off, and saying so is what keeps it from reading as
          an edit to your availability (GEO-2938). */}
      {viewerIsFree === false && (
        <Text as="p" variant="footnote" color="grey-04">
          This is outside the times you set. Requesting it doesn&rsquo;t change your availability.
        </Text>
      )}

      {booking.error && (
        <Text as="p" variant="footnote" color="red-01">
          {booking.error}
        </Text>
      )}
    </div>
  );
}

function SendRequest({
  booking,
  clock,
  startsAt,
  viewerIsFree,
  viewerTimezone,
}: {
  booking: PeerAvailabilityBooking;
  clock: () => number;
  startsAt: string | null;
  viewerIsFree: boolean | null;
  viewerTimezone: string;
}) {
  // Keyed by the start it was raised for, so picking another time clears it.
  const [passedFor, setPassedFor] = React.useState<string | null>(null);
  const passed = passedFor !== null && passedFor === startsAt;

  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <button
        type="button"
        disabled={!startsAt || booking.pending}
        {...(booking.mode === 'reschedule'
          ? debateActionAnalyticsAttributes('peer-availability', 'Propose new time', 'reschedule_scheduled_debate')
          : debateActionAnalyticsAttributes('peer-availability', 'Send request', 'request_scheduled_debate'))}
        onClick={() => {
          if (!startsAt) return;
          // Checked at the click rather than trusted from render: an open modal does not re-render
          // as a picked time goes by, and geo-chat refuses a past start.
          if (new Date(startsAt).getTime() <= clock()) {
            setPassedFor(startsAt);
            return;
          }
          setPassedFor(null);
          booking.onRequest(startsAt, { viewerIsFree, viewerTimezone });
        }}
        className="shrink-0 rounded-full bg-text px-3 py-1.5 text-metadata text-white disabled:opacity-40"
      >
        {booking.pending ? 'Sending…' : booking.mode === 'reschedule' ? 'Propose new time' : 'Send request'}
      </button>
      {passed && (
        <Text as="p" variant="footnote" color="red-01">
          That time has already passed. Pick another.
        </Text>
      )}
    </div>
  );
}

/**
 * A time of the viewer's own, for a week that offers none. `datetime-local` carries no zone, so it
 * is read in the grid's zone, like every other time here, and converted to an instant before it
 * leaves.
 */
function RequestAnyway({
  booking,
  clock,
  viewerTimezone,
  notBefore,
}: {
  booking: PeerAvailabilityBooking;
  clock: () => number;
  viewerTimezone: string;
  notBefore: number;
}) {
  const [local, setLocal] = React.useState('');
  const picked = viewerInputInstant(local, viewerTimezone);
  // geo-chat refuses a past start, so one never leaves here.
  const startsAt = picked && picked.getTime() > notBefore ? picked.toISOString() : null;

  return (
    <div className="mt-3 flex flex-col items-center gap-2">
      <Text as="p" variant="footnote" color="grey-04">
        You can still ask for a time.
      </Text>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <input
          type="datetime-local"
          aria-label="Time to request"
          min={viewerInputValue(notBefore, viewerTimezone)}
          value={local}
          onChange={event => setLocal(event.target.value)}
          className="rounded border border-grey-02 px-2 py-1 text-footnote"
        />
        <SendRequest
          booking={booking}
          clock={clock}
          startsAt={startsAt}
          viewerIsFree={null}
          viewerTimezone={viewerTimezone}
        />
      </div>
      {booking.error && (
        <Text as="p" variant="footnote" color="red-01">
          {booking.error}
        </Text>
      )}
    </div>
  );
}

/**
 * Seven columns on a desktop; one day per row at `mobile` (<=639px).
 *
 * Breakpoints here are max-width (see `--breakpoint-*: initial` in `styles/styles.css`), so the
 * desktop layout is the unprefixed one. A vertical day list rather than the editor's horizontal
 * scroller: nothing here is a drag target, so there are no off-screen days to discover.
 */
function WeekGrid({
  days,
  peerName,
  selectedStart,
  onSelect,
}: {
  days: PeerDay[];
  peerName: string;
  selectedStart: string | null;
  onSelect: (start: string | null) => void;
}) {
  return (
    <div className="grid min-h-0 flex-1 grid-cols-7 gap-3 overflow-y-auto overscroll-contain mobile:grid-cols-1 mobile:gap-2">
      {days.map(day => (
        <DayColumn key={day.date} day={day} peerName={peerName} selectedStart={selectedStart} onSelect={onSelect} />
      ))}
    </div>
  );
}

function DayColumn({
  day,
  peerName,
  selectedStart,
  onSelect,
}: {
  day: PeerDay;
  peerName: string;
  selectedStart: string | null;
  onSelect: (start: string | null) => void;
}) {
  // Opened on a preselected slot past the fold, the pick has to be visible.
  const [expanded, setExpanded] = React.useState(
    () => day.slots.findIndex(slot => slot.start === selectedStart) >= SLOTS_PER_DAY
  );
  const empty = day.slots.length === 0;
  const shown = expanded ? day.slots : day.slots.slice(0, SLOTS_PER_DAY);
  const hidden = day.slots.length - shown.length;
  const dayLabel = `${day.isToday ? 'Today' : day.weekdayLabel} ${day.dayLabel}`;

  return (
    <section
      // Named, because a chip's own label is a time that recurs on all seven days. `group` rather
      // than a landmark: seven regions in one grid is noise.
      role="group"
      aria-label={dayLabel}
      data-testid={`peer-day-${day.date}`}
      data-empty={empty || undefined}
      className={cx(
        'flex flex-col gap-2 rounded-lg border border-grey-02 p-2 mobile:gap-1.5',
        // Dimmed rather than hidden: a day with nothing in it is information about their week.
        empty && 'opacity-40'
      )}
    >
      <div className="flex flex-col gap-0 mobile:flex-row mobile:items-baseline mobile:gap-1.5">
        <Text as="span" variant="metadataMedium">
          {day.isToday ? 'Today' : day.weekdayLabel}
        </Text>
        <Text as="span" variant="footnote" color="grey-04">
          {day.dayLabel}
        </Text>
      </div>

      {empty ? (
        <Text as="span" variant="footnote" color="grey-04">
          Nothing free
        </Text>
      ) : (
        <div className="flex flex-col gap-1 mobile:flex-row mobile:flex-wrap">
          {shown.map(slot => (
            <SlotChip
              key={slot.start}
              slot={slot}
              dayLabel={dayLabel}
              peerName={peerName}
              selected={slot.start === selectedStart}
              onSelect={() => onSelect(slot.start === selectedStart ? null : slot.start)}
            />
          ))}
          {(hidden > 0 || expanded) && (
            <button
              type="button"
              // Named with its day for the same reason the chips are, and a toggle so an expanded
              // day can be put back.
              aria-label={expanded ? `Show less on ${dayLabel}` : `+${hidden} more times on ${dayLabel}`}
              aria-expanded={expanded}
              {...(expanded
                ? debateActionAnalyticsAttributes(
                    'peer-availability',
                    'Show fewer times',
                    'collapse_peer_availability_day'
                  )
                : debateActionAnalyticsAttributes(
                    'peer-availability',
                    'Show more times',
                    'expand_peer_availability_day'
                  ))}
              onClick={() => setExpanded(current => !current)}
              className="rounded-md px-2 py-1 text-left text-footnote text-grey-04 transition-colors hover:text-text"
            >
              {expanded ? 'Show less' : `+${hidden} more`}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * One 30-minute slot. Selection lives in the view, so picking one clears the last.
 *
 * Green means you are both free; dashed means only they are, and it stays a perfectly ordinary,
 * pickable slot.
 */
function SlotChip({
  slot,
  dayLabel,
  peerName,
  selected,
  onSelect,
}: {
  slot: PeerDaySlot;
  dayLabel: string;
  peerName: string;
  selected: boolean;
  onSelect: () => void;
}) {
  // The visible chip carries the day in its column and free-vs-not in its border, neither of which
  // survives into an accessible name: without this every chip is a bare time that recurs on all
  // seven days, and the green/dashed distinction the view exists to draw is invisible.
  const label = [
    `${dayLabel} at ${slot.label}`,
    slot.viewerIsFree === null
      ? `${peerName} is free`
      : slot.viewerIsFree
        ? 'you are both free'
        : `only ${peerName} is free`,
  ].join(', ');

  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={selected}
      data-viewer-free={slot.viewerIsFree === true || undefined}
      {...debateActionAnalyticsAttributes(
        'peer-availability',
        slot.viewerIsFree === true ? 'Mutual slot' : 'Slot',
        selected ? 'deselect_debate_slot' : 'select_debate_slot'
      )}
      onClick={onSelect}
      className={cx(
        'rounded-md border px-2 py-1 text-left text-footnote tabular-nums transition-colors',
        selected ? SELECTED_SLOT : slot.viewerIsFree === true ? MUTUAL_SLOT : PEER_ONLY_SLOT,
        // Here rather than in the shared looks, which the legend's static swatches also wear.
        !selected && 'hover:border-text'
      )}
    >
      {slot.label}
    </button>
  );
}

/** What green and dashed mean, drawn with the chips' own classes. */
function Legend({ peerName, showMutual }: { peerName: string; showMutual: boolean }) {
  return (
    <ul aria-label="Legend" className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1">
      {/* With no week of your own nothing can be mutual, and the hint above already says so. */}
      {showMutual && <LegendItem swatch={MUTUAL_SLOT}>You&rsquo;re both free</LegendItem>}
      <LegendItem swatch={PEER_ONLY_SLOT}>{firstName(peerName) ?? peerName} is free</LegendItem>
    </ul>
  );
}

function LegendItem({ swatch, children }: { swatch: string; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-1.5">
      <span aria-hidden className={cx('h-3 w-5 shrink-0 rounded-sm border', swatch)} />
      <Text as="span" variant="footnote" color="grey-04">
        {children}
      </Text>
    </li>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <div className="shrink-0 rounded-lg bg-[#EFE2FF] px-3 py-2">
      <Text as="p" variant="footnote">
        {children}
      </Text>
    </div>
  );
}

/** `action` sits outside the paragraph, so it may contain anything a `<p>` may not. */
function Empty({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center rounded-lg border border-dashed border-grey-02 p-6">
      <Text as="p" variant="metadata" color="grey-04">
        {children}
      </Text>
      {action}
    </div>
  );
}

/** A one-line state in place of the week. `action` sits outside the paragraph, like `Empty`'s. */
export function Notice({
  children,
  className,
  action,
}: {
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className={cx('flex flex-col items-center justify-center gap-3 p-6 text-center', className)}>
      <Text as="p" variant="metadata" color="grey-04">
        {children}
      </Text>
      {action}
    </div>
  );
}

/** The supplied name, or as a last resort enough of the id to tell two people apart. */
export function peerDisplayName(peerName: string | null | undefined, userId: string) {
  if (peerName) return peerName;
  return userId.length > 10 ? `${userId.slice(0, 8)}…` : userId;
}
