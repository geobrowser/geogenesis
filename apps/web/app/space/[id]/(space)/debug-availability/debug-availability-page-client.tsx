'use client';

import * as React from 'react';

import {
  type AvailabilityBlock,
  addDays,
  effectiveAvailability,
  formatTime,
  isoDate,
  localTimezone,
  mondayOf,
  slotsForRange,
  toPayload,
  weekDates,
} from '~/core/availability/blocks';

import { Text } from '~/design-system/text';

import { AvailabilityCalendar } from '~/partials/availability/availability-calendar';

/**
 * A page to try the GEO-2936 availability calendar against: the grid, the payload it would send,
 * and the slots the other person would be offered. Ported from the prototype that settled the
 * interaction, and kept beside `debug-debates` for the same reason — somewhere to exercise this
 * before it has a home in the product.
 */
export function DebugAvailabilityPageClient() {
  const [blocks, setBlocks] = React.useState<AvailabilityBlock[]>([]);
  // The calendar owns its blocks once mounted, so seeding and clearing replace it outright rather
  // than fighting it for control.
  const [seed, setSeed] = React.useState<{ blocks: AvailabilityBlock[]; key: number }>({ blocks: [], key: 0 });
  // Mount-only, like the calendar's own week: both read the viewer's clock and zone.
  const [context, setContext] = React.useState<{ dates: string[]; timezone: string } | null>(null);
  React.useEffect(
    () => setContext({ dates: weekDates(mondayOf(new Date())).map(isoDate), timezone: localTimezone() }),
    []
  );

  const replaceBlocks = (next: AvailabilityBlock[]) => {
    setSeed(current => ({ blocks: next, key: current.key + 1 }));
    setBlocks(next);
  };

  const days = context ? effectiveAvailability(blocks, context.dates) : [];
  const slotCount = days.reduce((total, day) => total + day.ranges.reduce((n, r) => n + slotsForRange(r).length, 0), 0);

  return (
    <div className="flex flex-col gap-4 py-6">
      <div className="flex items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <Text as="h1" variant="mediumTitle">
            Availability calendar
          </Text>
        </div>
        <div className="flex shrink-0 gap-2">
          {/* Clearing lives in the calendar's own toolbar. */}
          <DebugButton onClick={() => replaceBlocks(exampleWeek())}>Load example</DebugButton>
        </div>
      </div>

      <AvailabilityCalendar key={seed.key} initialBlocks={seed.blocks} onChange={setBlocks} />

      <div className="grid gap-4 md:grid-cols-1 lg:grid-cols-2">
        <Panel title="Payload to backend" count={`${blocks.length} ${blocks.length === 1 ? 'block' : 'blocks'}`}>
          <pre className="overflow-x-auto p-3 text-footnote whitespace-pre">
            {context ? JSON.stringify(toPayload(blocks, context.timezone), null, 2) : ''}
          </pre>
        </Panel>

        <Panel title="Offerable slots, this week" count={`${slotCount} ${slotCount === 1 ? 'slot' : 'slots'}`}>
          <div className="flex flex-col gap-2 p-3">
            {days
              .filter(day => day.ranges.length > 0)
              .map(day => (
                <div key={day.date} className="flex items-baseline gap-3">
                  <Text as="span" variant="footnote" color="grey-04" className="w-16 shrink-0">
                    {day.date.slice(5)}
                  </Text>
                  <div className="flex flex-wrap gap-1">
                    {day.ranges.flatMap(slotsForRange).map(slot => (
                      <span key={slot} className="rounded-sm border border-grey-02 px-1.5 text-footnote tabular-nums">
                        {formatTime(slot)}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            {slotCount === 0 && (
              <Text as="p" variant="footnote" color="grey-04">
                Nothing offerable yet.
              </Text>
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}

/** The prototype's example week: two recurring days, a one-off, and an exception over a recurring block. */
function exampleWeek(): AvailabilityBlock[] {
  const monday = mondayOf(new Date());
  const dateFor = (day: number) => isoDate(addDays(monday, day));
  return [
    { id: 'seed-1', kind: 'recurring', weekday: 1, start: 9 * 60, end: 10 * 60 },
    { id: 'seed-2', kind: 'recurring', weekday: 1, start: 18 * 60, end: 20 * 60 },
    { id: 'seed-3', kind: 'recurring', weekday: 3, start: 9 * 60, end: 10 * 60 },
    { id: 'seed-4', kind: 'recurring', weekday: 4, start: 19 * 60, end: 21 * 60 },
    { id: 'seed-5', kind: 'dated', date: dateFor(5), start: 11 * 60, end: 13 * 60 + 30 },
    { id: 'seed-6', kind: 'exception', date: dateFor(3), start: 9 * 60, end: 10 * 60 },
  ];
}

function Panel({ title, count, children }: { title: string; count: string; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-lg border border-grey-02 bg-white">
      <div className="flex items-center justify-between border-b border-grey-02 px-3 py-2">
        <Text as="h2" variant="metadataMedium">
          {title}
        </Text>
        <Text as="span" variant="footnote" color="grey-04">
          {count}
        </Text>
      </div>
      {children}
    </div>
  );
}

function DebugButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg border border-dashed border-grey-02 px-2.5 py-1 text-metadata text-grey-04 transition-colors hover:text-text"
    >
      {children}
    </button>
  );
}
