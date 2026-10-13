'use client';

import * as React from 'react';

import cx from 'classnames';

import { SLOT_MINUTES } from '~/core/availability/blocks';
import { slotStarts } from '~/core/availability/peer-schedule';

import { Text } from '~/design-system/text';

import { LegendItem } from '~/partials/availability/peer-availability';

import type { AnnotatedSlot } from '../api';
import { timeIn } from './admin-debate-calendar-model';
import { dateLabels, halfHoursOf, zoneLabel } from './admin-match-zone';
import { hourLabel } from './debate-calendar-model';
import { HubPillButton } from './hub-pill-button';

const HALF_HOURS_PER_DAY = (24 * 60) / SLOT_MINUTES;
/** Far past a fortnight of half-hours, so no window is ever cut short. */
const MAX_STARTS_PER_WINDOW = HALF_HOURS_PER_DAY * 31;
const TICK_HOURS = [0, 3, 6, 9, 12, 15, 18, 21];

/** One look per debater, and a third for both, shared with the legend so the key cannot drift. */
const FIRST_FREE = 'bg-ctaPrimary/70';
const SECOND_FREE = 'bg-orange';
const BOTH_FREE = 'bg-green';
/** Hatched: a time outside what geo-chat answered for, which is neither free nor busy. */
const UNKNOWN = 'bg-[repeating-linear-gradient(135deg,var(--color-grey-02)_0_2px,transparent_2px_5px)]';

/** One debater's side of the strip: their free time, or why it is not drawn. */
export type DebaterAvailability = {
  name: string;
  /** Their free windows; `null` while unknown. */
  slots: AnnotatedSlot[] | null;
  /**
   * Where their answer starts. geo-chat walks their fortnight from their own midnight on the UTC
   * date, so for anyone west of GMT the rest of their evening is not in it: before this, a time is
   * unknown rather than busy. `null` treats every time as covered.
   */
  knownFrom: number | null;
  pending: boolean;
  error: boolean;
  onRetry: () => void;
};

/** Free, busy, or `null` where their availability is not known. */
type Side = boolean | null;
type Cell = { start: number; end: number; first: Side; second: Side };

/**
 * Both debaters' availability, one row per bookable day (GEO-3231): debater 1 on the top half of
 * each half-hour, debater 2 on the bottom, and the whole half-hour green where both are free. Drawn
 * in the dialog's zone, so it lines up with every other time on screen.
 *
 * A pointer picks a half-hour straight off the strip. The cells themselves are hidden from
 * assistive tech, 672 of them being noise rather than a calendar: each day instead says in words
 * when each of them is free, and Recommended and Pick any time stay the keyboard's way to choose.
 */
export function AdminPairAvailability({
  days,
  zone,
  zoneName,
  now,
  first,
  second,
  selected,
  onPick,
}: {
  /** Dates in `zone`, today first. */
  days: string[];
  zone: string;
  /** The zone alone, e.g. `GMT`: the strip spans two weeks, which can cross a clock change. */
  zoneName: string;
  now: number;
  first: DebaterAvailability;
  second: DebaterAvailability;
  selected: number | null;
  onPick: (start: number) => void;
}) {
  const firstStarts = useStarts(first.slots);
  const secondStarts = useStarts(second.slots);

  // The half-hours themselves cost a zone lookup each, so only a new zone or day redraws them.
  const halfHours = React.useMemo(() => days.map(date => ({ date, starts: halfHoursOf(date, zone) })), [days, zone]);
  const firstSide = useSide(firstStarts, first.slots === null, first.knownFrom);
  const secondSide = useSide(secondStarts, second.slots === null, second.knownFrom);
  const rows = React.useMemo(
    () =>
      halfHours.map(({ date, starts }) => ({
        date,
        cells: starts.map(start => ({
          start,
          end: start + SLOT_MINUTES * 60_000,
          first: firstSide(start),
          second: secondSide(start),
        })),
      })),
    [firstSide, halfHours, secondSide]
  );
  const anyUnknown = rows.some(({ cells }) =>
    cells.some(cell => cell.start > now && (cell.first === null || cell.second === null))
  );

  const pick = (event: React.MouseEvent<HTMLElement>) => {
    const start = Number((event.target as HTMLElement).closest<HTMLElement>('[data-start]')?.dataset.start);
    if (Number.isFinite(start) && start > now) onPick(start);
  };

  return (
    <section aria-label={`Availability in ${zoneName}`} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <Text as="p" variant="metadataMedium">
          Availability
        </Text>
        <ul aria-label="Legend" className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <LegendItem swatch={FIRST_FREE}>{first.name} free</LegendItem>
          <LegendItem swatch={SECOND_FREE}>{second.name} free</LegendItem>
          <LegendItem swatch={BOTH_FREE}>Both free</LegendItem>
          {anyUnknown ? <LegendItem swatch={UNKNOWN}>Not known yet</LegendItem> : null}
        </ul>
      </div>
      {[first, second].map((person, index) =>
        person.error ? (
          <div key={index} className="flex flex-wrap items-center gap-2">
            <Text as="p" variant="footnote" className="text-red-01">
              Couldn&rsquo;t load {person.name}&rsquo;s availability.
            </Text>
            <HubPillButton analyticsSurface="calendar" onClick={person.onRetry}>
              Try again
            </HubPillButton>
          </div>
        ) : person.pending ? (
          <Text key={index} as="p" variant="footnote" color="grey-04">
            Loading {person.name}&rsquo;s availability…
          </Text>
        ) : null
      )}
      <div className="flex flex-col gap-1">
        <div aria-hidden className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-end gap-2">
          <span />
          <div className="grid grid-cols-8">
            {TICK_HOURS.map(hour => (
              <span
                key={hour}
                className="truncate border-l border-grey-02 pl-0.5 text-[0.625rem] leading-3 text-grey-04"
              >
                {hourLabel(hour)}
              </span>
            ))}
          </div>
        </div>
        <ul className="flex flex-col gap-1">
          {rows.map(({ date, cells }) => {
            const labels = dateLabels(date);
            const clockChange =
              cells.length > HALF_HOURS_PER_DAY
                ? { mark: '+1h', note: 'Clocks go back an hour: this day is 25 hours.' }
                : cells.length < HALF_HOURS_PER_DAY
                  ? { mark: '−1h', note: 'Clocks go forward an hour: this day is 23 hours.' }
                  : null;
            return (
              <li key={date} className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-2">
                <Text as="span" variant="footnote" color="grey-04" className="truncate">
                  {labels.full}
                  {clockChange ? (
                    <span aria-hidden title={clockChange.note} className="ml-1 text-purple">
                      {clockChange.mark}
                    </span>
                  ) : null}
                </Text>
                <span className="sr-only">
                  {[daySummary(labels.long, cells, first, second, zone), clockChange?.note].filter(Boolean).join(' ')}
                </span>
                {/* One column per real half-hour, so the day the clocks change is a column longer or shorter. */}
                <div
                  aria-hidden
                  onClick={pick}
                  className="grid h-4 gap-px overflow-hidden rounded-sm bg-grey-02"
                  style={{ gridTemplateColumns: `repeat(${cells.length}, minmax(0, 1fr))` }}
                >
                  {cells.map((cell, index) => (
                    <span
                      key={index}
                      data-start={cell.start}
                      title={cellTitle(cell, first.name, second.name, zone)}
                      className={cx(
                        'relative flex flex-col bg-white',
                        cell.start <= now ? 'opacity-30' : 'cursor-pointer hover:brightness-90',
                        // Every three hours a slightly stronger rule, to match the ticks above.
                        index % 6 === 0 && index > 0 && 'shadow-[inset_1px_0_0_var(--color-grey-03)]',
                        cell.start === selected && 'z-10 outline-2 -outline-offset-2 outline-text'
                      )}
                    >
                      {cell.first && cell.second ? (
                        <span className={cx('flex-1', BOTH_FREE)} />
                      ) : (
                        <>
                          <span className={cx('flex-1', sideLook(cell.first, FIRST_FREE))} />
                          <span className={cx('flex-1', sideLook(cell.second, SECOND_FREE))} />
                        </>
                      )}
                    </span>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

/** Every half-hour start inside their windows, as instants, so a cell is one lookup. */
function useStarts(slots: AnnotatedSlot[] | null): Set<number> {
  return React.useMemo(
    () =>
      new Set(
        (slots ?? []).flatMap(slot => slotStarts(slot, { max: MAX_STARTS_PER_WINDOW }).map(start => start.getTime()))
      ),
    [slots]
  );
}

/** Free, busy or not known at `start`, stable while their answer is. */
function useSide(starts: Set<number>, unknown: boolean, knownFrom: number | null): (start: number) => Side {
  return React.useCallback(
    (start: number) => (unknown || (knownFrom !== null && start < knownFrom) ? null : starts.has(start)),
    [knownFrom, starts, unknown]
  );
}

function sideLook(side: Side, free: string) {
  return side === null ? UNKNOWN : side ? free : null;
}

function cellTitle(cell: Cell, firstName: string, secondName: string, zone: string) {
  const sideText = (name: string, side: Side) =>
    side === null ? `${name} not known yet` : side ? `${name} free` : `${name} busy`;
  const who =
    cell.first && cell.second
      ? 'Both free'
      : `${sideText(firstName, cell.first)}, ${sideText(secondName, cell.second)}`;
  // Each time with the offset it has then: a fortnight can cross a clock change.
  return `${timeIn(cell.start, zone)} ${zoneLabel(zone, cell.start)} · ${who}`;
}

/** The runs of consecutive cells `matches` holds for, as instants. */
function runs(cells: Cell[], matches: (cell: Cell) => boolean): { from: number; to: number }[] {
  const found: { from: number; to: number }[] = [];
  for (const cell of cells) {
    if (!matches(cell)) continue;
    const last = found.at(-1);
    if (last && last.to === cell.start) last.to = cell.end;
    else found.push({ from: cell.start, to: cell.end });
  }
  return found;
}

/** `9:00 AM–12:00 PM, 3:00 PM–5:00 PM`, as wall clocks in `zone`. */
function rangesText(found: { from: number; to: number }[], zone: string): string {
  return found.map(({ from, to }) => `${timeIn(from, zone)}–${timeIn(to, zone)}`).join(', ');
}

function daySummary(day: string, cells: Cell[], first: DebaterAvailability, second: DebaterAvailability, zone: string) {
  const side = (person: DebaterAvailability, of: (cell: Cell) => Side) => {
    const unknown = runs(cells, cell => of(cell) === null);
    if (unknown.length === 1 && unknown[0].from === cells[0].start && unknown[0].to === cells.at(-1)!.end)
      return `${person.name} not known`;
    const parts: string[] = [
      // Only ever the start of their window, so one run from midnight.
      ...unknown.map(({ from, to }) =>
        from === cells[0].start
          ? `not known before ${timeIn(to, zone)}`
          : `not known ${rangesText([{ from, to }], zone)}`
      ),
    ];
    const free = runs(cells, cell => of(cell) === true);
    if (free.length > 0) parts.push(`free ${rangesText(free, zone)}`);
    return `${person.name} ${parts.length > 0 ? parts.join(', ') : 'not free'}`;
  };
  const both = runs(cells, cell => cell.first === true && cell.second === true);
  return [
    `${day}:`,
    `${side(first, cell => cell.first)};`,
    `${side(second, cell => cell.second)};`,
    both.length > 0 ? `both free ${rangesText(both, zone)}` : 'never both free',
  ].join(' ');
}
