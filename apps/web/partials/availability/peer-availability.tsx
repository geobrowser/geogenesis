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
 * Another person's availability, read-only (GEO-2938).
 *
 * ## It draws the overlap today, and says so
 *
 * GEO-2938 wants their whole week, styled by the viewer's own rather than filtered by it. The
 * endpoint cannot say that yet: it returns mutual slots only, and nothing at all when either side
 * has no schedule. So every string here is about the pair, and a viewer with no schedule gets the
 * hint bar rather than a dashed week.
 *
 * The dashed path below is built and tested against {@link PeerDaySlot.viewerIsFree}. Landing the
 * API change means flipping those strings back as well as changing the adapter.
 *
 * ## Viewing only
 *
 * No invite, no request, no footer action — scheduling is a later slice. The chips are already
 * buttons and selection already exists, so that half drops in rather than being retrofitted; a
 * dead CTA is deliberately not rendered in the meantime.
 *
 * Takes a user id and nothing else, so the shareable link that will eventually open this can
 * mount it without this component knowing anything about routing.
 */
export function PeerAvailability({ userId, peerName, className }: Props) {
  const { schedule, enabled, isPending, isError } = usePeerSchedule(userId);

  // Signed out there is no viewer to compare against, so the question cannot be asked rather than
  // having failed — a distinction worth drawing, since one of these is fixable by signing in.
  if (!enabled) return <Notice className={className}>Sign in to see when someone is free.</Notice>;
  if (isPending) return <Notice className={className}>Loading availability…</Notice>;
  if (isError || !schedule) return <Notice className={className}>Couldn&rsquo;t load their availability.</Notice>;

  return <PeerAvailabilityView schedule={schedule} peerName={peerName} className={className} />;
}

type Props = {
  userId: string;
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
}: {
  schedule: PeerSchedule;
  peerName?: string | null;
  className?: string;
  /** Pins the week. Tests pass it; nothing in the app does. */
  now?: Date;
}) {
  const days = React.useMemo(() => peerScheduleDays(schedule, now), [schedule, now]);
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
          When you and {name} are both free
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

      {/* Today's endpoint returns only mutual slots, so with no schedule of your own there is
          nothing to intersect and no times at all. Softens once the API sends their week whole. */}
      {!schedule.viewerHasSchedule && <Hint>Set your availability to see when you and {name} are both free.</Hint>}

      {schedule.peerHasSchedule === false && !hasAnySlot ? (
        <Empty>{name} hasn&rsquo;t set any availability yet.</Empty>
      ) : !hasAnySlot ? (
        // About the pair, not about them: with no viewer schedule the response cannot say whether
        // their week is empty, so naming them would be a guess stated as fact.
        <Empty>No shared times in the next 7 days.</Empty>
      ) : (
        <WeekGrid days={days} peerName={name} />
      )}

      {schedule.truncated && (
        <Text as="p" variant="footnote" color="grey-04" className="shrink-0">
          Showing the first of your shared times.
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
function WeekGrid({ days, peerName }: { days: PeerDay[]; peerName: string }) {
  return (
    <div className="grid min-h-0 flex-1 grid-cols-7 gap-3 overflow-y-auto overscroll-contain mobile:grid-cols-1 mobile:gap-2">
      {days.map(day => (
        <DayColumn key={day.date} day={day} peerName={peerName} />
      ))}
    </div>
  );
}

function DayColumn({ day, peerName }: { day: PeerDay; peerName: string }) {
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
            <SlotChip key={slot.start} slot={slot} dayLabel={dayLabel} peerName={peerName} />
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
 * One 30-minute slot.
 *
 * A button, and selectable, although nothing consumes the selection yet — this is the surface the
 * scheduling slice hangs its "request this time" off, and making it inert now would mean rebuilding
 * the grid then. Dashed and muted means only they are free; it stays a perfectly ordinary,
 * pickable slot.
 */
function SlotChip({ slot, dayLabel, peerName }: { slot: PeerDaySlot; dayLabel: string; peerName: string }) {
  const [selected, setSelected] = React.useState(false);
  // Per slot rather than per week: a week spanning a DST change carries two offsets, and one can
  // sit on the far side of the threshold from the other.
  const showPeerTime = Math.abs(slot.offsetMinutes) >= LARGE_OFFSET_MINUTES;

  // The visible chip carries the day in its column and free-vs-not in its border, neither of which
  // survives into an accessible name: without this every chip is a bare time that recurs on all
  // seven days, and the solid/dashed distinction the view exists to draw is invisible.
  const label = [
    `${dayLabel} at ${slot.label}`,
    showPeerTime ? `${slot.peerLabel} for ${peerName}` : null,
    slot.viewerIsFree ? 'you are both free' : `only ${peerName} is free`,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={selected}
      data-viewer-free={slot.viewerIsFree || undefined}
      onClick={() => setSelected(current => !current)}
      className={cx(
        'rounded-md border px-2 py-1 text-left text-footnote tabular-nums transition-colors',
        slot.viewerIsFree
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

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-grey-02 p-6">
      <Text as="p" variant="metadata" color="grey-04">
        {children}
      </Text>
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
