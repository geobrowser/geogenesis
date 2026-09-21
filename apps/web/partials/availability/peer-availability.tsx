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
 * ## It shows their week, not the overlap
 *
 * The grid is *their* availability. The viewer's own only decides how a slot is drawn — solid
 * where both are free, dashed where only they are — and never whether it is drawn at all.
 * Availability is a preference, not a constraint, and filtering to the intersection would both
 * overstate the app's certainty and break the case this view exists for: opening a link with no
 * schedule of your own, to see when one particular person is around. That viewer sees the whole
 * week, all dashed.
 *
 * Which is also why the nudge to set your own is a hint bar and not a gate.
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

  // The offset is per instant, so it is read off a real slot rather than computed for "now" —
  // a week that crosses a DST boundary genuinely has two of them, and the one worth naming in
  // the header is the one attached to the times being looked at.
  const offsetMinutes = days.flatMap(day => day.slots)[0]?.offsetMinutes ?? 0;
  const showPeerTimes = Math.abs(offsetMinutes) >= LARGE_OFFSET_MINUTES;

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
                offsetMinutes === 0 ? ', the same time as you' : `, ${formatOffset(offsetMinutes)}`
              }.`
            : 'Times shown in your local time.'}
        </Text>
      </header>

      {!schedule.viewerHasSchedule && (
        <Hint>
          You haven&rsquo;t set your own availability. You can still see {name}&rsquo;s — setting yours just marks the
          times you both have free.
        </Hint>
      )}

      {schedule.peerHasSchedule === false && !hasAnySlot ? (
        <Empty>{name} hasn&rsquo;t set any availability yet.</Empty>
      ) : !hasAnySlot ? (
        // `peerHasSchedule === null` and nothing to show: the endpoint cannot tell us whether the
        // week is empty or simply unreadable without a schedule of the viewer's own, and saying
        // "they have nothing" on that evidence would be a guess presented as a fact.
        <Empty>No times to show for {name} in the next 7 days.</Empty>
      ) : (
        <WeekGrid days={days} showPeerTimes={showPeerTimes} />
      )}

      {schedule.truncated && (
        <Text as="p" variant="footnote" color="grey-04" className="shrink-0">
          Showing the first of {name}&rsquo;s available times.
        </Text>
      )}
    </div>
  );
}

/**
 * Seven columns on a desktop; one day per row on a phone.
 *
 * The availability *editor* solves narrow screens with a horizontal scroller, because its blocks
 * are drag targets and a drag needs the columns side by side to make sense. Nothing here is
 * dragged — these are chips you read and eventually tap — so a vertical day list is the better
 * trade: no off-screen days to discover, no travelling headers, and the day a slot belongs to is
 * beside it rather than above a scroll position.
 */
function WeekGrid({ days, showPeerTimes }: { days: PeerDay[]; showPeerTimes: boolean }) {
  return (
    <div className="sm:grid-cols-7 sm:gap-3 grid min-h-0 flex-1 gap-2 overflow-y-auto overscroll-contain">
      {days.map((day, index) => (
        <DayColumn key={day.date} day={day} isToday={index === 0} showPeerTimes={showPeerTimes} />
      ))}
    </div>
  );
}

function DayColumn({ day, isToday, showPeerTimes }: { day: PeerDay; isToday: boolean; showPeerTimes: boolean }) {
  const [expanded, setExpanded] = React.useState(false);
  const empty = day.slots.length === 0;
  const shown = expanded ? day.slots : day.slots.slice(0, SLOTS_PER_DAY);
  const hidden = day.slots.length - shown.length;

  return (
    <section
      data-testid={`peer-day-${day.date}`}
      data-empty={empty || undefined}
      className={cx(
        'sm:gap-2 flex flex-col gap-1.5 rounded-lg border border-grey-02 p-2',
        // Dimmed rather than hidden: a day with nothing in it is information about their week.
        empty && 'opacity-40'
      )}
    >
      <div className="sm:flex-col sm:gap-0 flex items-baseline gap-1.5">
        <Text as="span" variant="metadataMedium">
          {isToday ? 'Today' : day.weekdayLabel}
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
        <div className="sm:flex-col flex flex-wrap gap-1">
          {shown.map(slot => (
            <SlotChip key={slot.start} slot={slot} showPeerTime={showPeerTimes} />
          ))}
          {hidden > 0 && (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="rounded-md px-2 py-1 text-left text-footnote text-grey-04 transition-colors hover:text-text"
            >
              +{hidden} more
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
function SlotChip({ slot, showPeerTime }: { slot: PeerDaySlot; showPeerTime: boolean }) {
  const [selected, setSelected] = React.useState(false);

  return (
    <button
      type="button"
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
