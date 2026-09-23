'use client';

import * as React from 'react';

import cx from 'classnames';

import {
  LARGE_OFFSET_MINUTES,
  type PeerDay,
  type PeerDaySlot,
  type PeerSchedule,
  formatOffset,
  peerScheduleDays,
} from '~/core/availability/peer-schedule';
import { usePeerSchedule } from '~/core/debates/hooks';

import { Text } from '~/design-system/text';

/**
 * How many slots a day shows before the expander.
 *
 * A normally available week is around sixteen a day, and sixteen chips in a column is a wall
 * rather than a week. Four is the prototype's number and is the first thing to revisit if it
 * reads wrong against real schedules.
 */
const SLOTS_PER_DAY = 4;

/**
 * Supplied by a caller that can act on a picked time, which turns the footer on. Absent, the week
 * stays read-only and no CTA renders.
 */
export type PeerAvailabilityBooking = {
  /** An instant, not a chip: a week with no slots is still requestable (GEO-2938). */
  onRequest: (startsAt: string) => void;
  pending: boolean;
  error: string | null;
  /** The instant the server accepted, which swaps the footer for a confirmation. */
  requestedStart: string | null;
};

/**
 * Another person's availability (GEO-2938).
 *
 * ## It shows their week, not the overlap
 *
 * The grid is *their* availability; the viewer's own picks solid over dashed, never whether a
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
export function PeerAvailability({ userId, peerName, className, booking }: Props) {
  const { schedule, enabled, isPending, isError } = usePeerSchedule(userId);

  // Signed out there is no viewer to compare against, so the question cannot be asked rather than
  // having failed — a distinction worth drawing, since one of these is fixable by signing in.
  if (!enabled) return <Notice className={className}>Sign in to see when someone is free.</Notice>;
  if (isPending) return <Notice className={className}>Loading availability…</Notice>;
  if (isError || !schedule) return <Notice className={className}>Couldn&rsquo;t load their availability.</Notice>;

  return <PeerAvailabilityView schedule={schedule} peerName={peerName} className={className} booking={booking} />;
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
}: {
  schedule: PeerSchedule;
  peerName?: string | null;
  className?: string;
  /** Pins the week. Tests pass it; nothing in the app does. */
  now?: Date;
  booking?: PeerAvailabilityBooking;
}) {
  const days = React.useMemo(() => peerScheduleDays(schedule, now), [schedule, now]);
  // One pick per week, held here rather than per chip: two selected times is not a thing anyone
  // can ask for, and the footer needs to name the one that is.
  const [selectedStart, setSelectedStart] = React.useState<string | null>(null);
  const selectedSlot = days.flatMap(day => day.slots).find(slot => slot.start === selectedStart) ?? null;
  const name = peerName || shortId(schedule.userId);
  const hasAnySlot = days.some(day => day.slots.length > 0);

  // A week crossing a DST boundary holds two genuinely different offsets, so the header names one
  // only when every slot agrees. Each chip decides for itself whether to carry their local time.
  const offsets = new Set(days.flatMap(day => day.slots).map(slot => slot.offsetMinutes));
  const uniformOffset = offsets.size === 1 ? [...offsets][0] : null;

  return (
    <div className={cx('flex min-h-0 flex-col gap-4', className)}>
      <header className="flex shrink-0 flex-col gap-1">
        <Text as="h2" variant="smallTitle">
          When {name} is free
        </Text>
        <Text as="p" variant="footnote" color="grey-04">
          {/* geo-chat sends an empty zone for a side with no saved schedule, so naming them is
              conditional — "Ada is in ," otherwise. */}
          {schedule.viewerTimezone && schedule.peerTimezone
            ? `Times shown in your zone, ${schedule.viewerTimezone}. ${name} is in ${schedule.peerTimezone}${
                uniformOffset === null ? '' : `, ${formatOffset(uniformOffset)}`
              }.`
            : 'Times shown in your local time.'}
        </Text>
      </header>

      {!schedule.theirWeekKnown ? (
        // An older geo-chat cannot send their week at all, and its intersection says nothing
        // about them. Better to say so than to report an empty week as theirs.
        <Empty>Can&rsquo;t show {name}&rsquo;s week from this server yet.</Empty>
      ) : !schedule.peerHasSchedule || !hasAnySlot ? (
        // Availability is a preference, not a gate, so a caller that can book is offered a time of
        // its own rather than a wall (GEO-2938).
        <Empty
          action={
            booking && <RequestAnyway booking={booking} peerName={name} peerTimezone={schedule.peerTimezone} />
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
          <WeekGrid days={days} peerName={name} selectedStart={selectedStart} onSelect={setSelectedStart} />
          {booking && (
            <BookingFooter
              booking={booking}
              startsAt={selectedStart}
              viewerIsFree={selectedSlot?.viewerIsFree ?? null}
              peerName={name}
              peerTimezone={schedule.peerTimezone}
            />
          )}
        </>
      )}
    </div>
  );
}

/** Only rendered for a caller that can act on the pick, so there is never a dead CTA here. */
function BookingFooter({
  booking,
  startsAt,
  viewerIsFree,
  peerName,
  peerTimezone,
}: {
  booking: PeerAvailabilityBooking;
  startsAt: string | null;
  viewerIsFree: boolean | null;
  peerName: string;
  peerTimezone?: string | null;
}) {
  if (booking.requestedStart) {
    return (
      <Hint>
        Requested {formatIn(booking.requestedStart)}. {peerName} has to accept before the room is booked.
      </Hint>
    );
  }

  const theirTime = startsAt && peerTimezone ? formatIn(startsAt, peerTimezone) : null;

  return (
    <div className="flex shrink-0 flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col">
          <Text as="span" variant="footnote" color="grey-04">
            {startsAt ? `Your time: ${formatIn(startsAt)}` : 'Pick a time above.'}
          </Text>
          {theirTime && (
            <Text as="span" variant="footnote" color="grey-04">
              {peerName}&rsquo;s time: {theirTime}
            </Text>
          )}
        </div>
        <SendRequest booking={booking} startsAt={startsAt} />
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

function SendRequest({ booking, startsAt }: { booking: PeerAvailabilityBooking; startsAt: string | null }) {
  return (
    <button
      type="button"
      disabled={!startsAt || booking.pending}
      onClick={() => startsAt && booking.onRequest(startsAt)}
      className="shrink-0 rounded-full bg-text px-3 py-1.5 text-metadata text-white disabled:opacity-40"
    >
      {booking.pending ? 'Sending…' : 'Send request'}
    </button>
  );
}

/**
 * A time of the viewer's own, for a week that offers none. `datetime-local` reads as local wall
 * clock, so it is converted to an instant before it leaves here.
 */
function RequestAnyway({
  booking,
  peerName,
  peerTimezone,
}: {
  booking: PeerAvailabilityBooking;
  peerName: string;
  peerTimezone?: string | null;
}) {
  const [local, setLocal] = React.useState('');
  const startsAt = local ? new Date(local).toISOString() : null;

  if (booking.requestedStart) {
    return (
      <Hint>
        Requested {formatIn(booking.requestedStart)}. {peerName} has to accept before the room is booked.
      </Hint>
    );
  }

  return (
    <div className="mt-3 flex flex-col items-center gap-2">
      <Text as="p" variant="footnote" color="grey-04">
        You can still ask for a time.
      </Text>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <input
          type="datetime-local"
          aria-label="Time to request"
          value={local}
          onChange={event => setLocal(event.target.value)}
          className="rounded border border-grey-02 px-2 py-1 text-footnote"
        />
        <SendRequest booking={booking} startsAt={startsAt} />
      </div>
      {startsAt && peerTimezone && (
        <Text as="span" variant="footnote" color="grey-04">
          {peerName}&rsquo;s time: {formatIn(startsAt, peerTimezone)}
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

/** `undefined` zone means the viewer's own, which is what `toLocaleString` does by default. */
function formatIn(iso: string, timeZone?: string | null) {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return iso;
  return at.toLocaleString(undefined, timeZone ? { timeZone } : undefined);
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
  const [expanded, setExpanded] = React.useState(false);
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
 * Dashed and muted means only they are free; it stays a perfectly ordinary, pickable slot.
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
  // Per slot rather than per week: a week spanning a DST change carries two offsets, and one can
  // sit on the far side of the threshold from the other.
  const showPeerTime = Math.abs(slot.offsetMinutes) >= LARGE_OFFSET_MINUTES;

  // The visible chip carries the day in its column and free-vs-not in its border, neither of which
  // survives into an accessible name: without this every chip is a bare time that recurs on all
  // seven days, and the solid/dashed distinction the view exists to draw is invisible.
  const label = [
    `${dayLabel} at ${slot.label}`,
    showPeerTime ? `${slot.peerLabel} for ${peerName}` : null,
    slot.viewerIsFree === null
      ? `${peerName} is free`
      : slot.viewerIsFree
        ? 'you are both free'
        : `only ${peerName} is free`,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={selected}
      data-viewer-free={slot.viewerIsFree === true || undefined}
      onClick={onSelect}
      className={cx(
        'rounded-md border px-2 py-1 text-left text-footnote tabular-nums transition-colors',
        slot.viewerIsFree === true
          ? 'border-solid border-grey-02 bg-[#F6F6F6] text-text hover:bg-grey-01'
          : 'border-dashed border-grey-02 bg-transparent text-grey-04 hover:text-text',
        selected && 'border-solid border-text bg-[#EFE2FF] text-text'
      )}
    >
      <span>{slot.label}</span>
      {showPeerTime && (
        <span className="block text-grey-04">
          {slot.peerLabel} <span className="sr-only">their time</span>
        </span>
      )}
    </button>
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

function Notice({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cx('flex items-center justify-center p-6', className)}>
      <Text as="p" variant="metadata" color="grey-04">
        {children}
      </Text>
    </div>
  );
}

/** Last resort when nobody supplied a name: enough of the id to tell two people apart. */
function shortId(userId: string) {
  return userId.length > 10 ? `${userId.slice(0, 8)}…` : userId;
}
