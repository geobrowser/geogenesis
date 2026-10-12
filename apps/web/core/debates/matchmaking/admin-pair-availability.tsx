'use client';

import * as React from 'react';

import cx from 'classnames';

import { SLOT_MINUTES } from '~/core/availability/blocks';
import { slotStarts } from '~/core/availability/peer-schedule';

import { Text } from '~/design-system/text';

import { LegendItem } from '~/partials/availability/peer-availability';

import type { AnnotatedSlot } from '../api';
import { dateLabels, instantAt, wallTime } from './admin-match-zone';
import { hourLabel } from './debate-calendar-model';
import { HubPillButton } from './hub-pill-button';

const CELLS_PER_DAY = (24 * 60) / SLOT_MINUTES;
/** Far past a fortnight of half-hours, so no window is ever cut short. */
const MAX_STARTS_PER_WINDOW = CELLS_PER_DAY * 31;
const TICK_HOURS = [0, 3, 6, 9, 12, 15, 18, 21];

/** One look per debater, and a third for both, shared with the legend so the key cannot drift. */
const FIRST_FREE = 'bg-ctaPrimary/70';
const SECOND_FREE = 'bg-orange';
const BOTH_FREE = 'bg-green';

/** One debater's side of the strip: their free time, or why it is not drawn. */
export type DebaterAvailability = {
  name: string;
  /** Their free windows; `null` while unknown. */
  slots: AnnotatedSlot[] | null;
  pending: boolean;
  error: boolean;
  onRetry: () => void;
};

type Cell = { start: number; first: boolean; second: boolean };

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
  /** What the zone is called on screen, e.g. `GMT`. */
  zoneName: string;
  now: number;
  first: DebaterAvailability;
  second: DebaterAvailability;
  selected: number | null;
  onPick: (start: number) => void;
}) {
  const firstStarts = useStarts(first.slots);
  const secondStarts = useStarts(second.slots);

  const rows = React.useMemo(
    () =>
      days.map(date => {
        const cells: Cell[] = [];
        for (let index = 0; index < CELLS_PER_DAY; index += 1) {
          const start = instantAt(date, index * SLOT_MINUTES, zone);
          cells.push({ start, first: firstStarts.has(start), second: secondStarts.has(start) });
        }
        return { date, cells };
      }),
    [days, firstStarts, secondStarts, zone]
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
            return (
              <li key={date} className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-2">
                <Text as="span" variant="footnote" color="grey-04" className="truncate">
                  {labels.full}
                </Text>
                <span className="sr-only">{daySummary(labels.long, cells, first, second)}</span>
                <div
                  aria-hidden
                  onClick={pick}
                  className="grid h-4 gap-px overflow-hidden rounded-sm bg-grey-02"
                  style={{ gridTemplateColumns: `repeat(${CELLS_PER_DAY}, minmax(0, 1fr))` }}
                >
                  {cells.map((cell, index) => (
                    <span
                      key={index}
                      data-start={cell.start}
                      title={cellTitle(cell, index, first.name, second.name, zoneName)}
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
                          <span className={cx('flex-1', cell.first && FIRST_FREE)} />
                          <span className={cx('flex-1', cell.second && SECOND_FREE)} />
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

function cellTitle(cell: Cell, index: number, firstName: string, secondName: string, zoneName: string) {
  const who =
    cell.first && cell.second
      ? 'Both free'
      : cell.first
        ? `${firstName} free`
        : cell.second
          ? `${secondName} free`
          : 'Neither free';
  return `${wallTime(index * SLOT_MINUTES)} ${zoneName} · ${who}`;
}

/** `9:00 AM–12:00 PM, 3:00 PM–5:00 PM`: the runs of cells `free` is true for, as wall clocks. */
function freeRanges(cells: Cell[], free: (cell: Cell) => boolean): string {
  const ranges: string[] = [];
  let from: number | null = null;
  cells.forEach((cell, index) => {
    if (free(cell) && from === null) from = index;
    if (!free(cell) && from !== null) {
      ranges.push(`${wallTime(from * SLOT_MINUTES)}–${wallTime(index * SLOT_MINUTES)}`);
      from = null;
    }
  });
  if (from !== null) ranges.push(`${wallTime(from * SLOT_MINUTES)}–${wallTime(CELLS_PER_DAY * SLOT_MINUTES)}`);
  return ranges.join(', ');
}

function daySummary(day: string, cells: Cell[], first: DebaterAvailability, second: DebaterAvailability) {
  const side = (person: DebaterAvailability, free: (cell: Cell) => boolean) => {
    if (person.slots === null) return `${person.name} unknown`;
    const ranges = freeRanges(cells, free);
    return ranges ? `${person.name} free ${ranges}` : `${person.name} not free`;
  };
  const both = freeRanges(cells, cell => cell.first && cell.second);
  return [
    `${day}:`,
    `${side(first, cell => cell.first)};`,
    `${side(second, cell => cell.second)};`,
    both ? `both free ${both}` : 'never both free',
  ].join(' ');
}
