'use client';

import * as React from 'react';

import type { ScheduleEntry } from '~/core/availability/schedule-analytics';

import { Text } from '~/design-system/text';

import {
  type CellPerson,
  DAYS_IN_WEEK,
  type FreeSlot,
  HOURS_IN_DAY,
  type OwnDebate,
  cellKey,
  cellOf,
  timeRangeLabel,
} from './debate-calendar-model';
import { HubPillButton } from './hub-pill-button';
import { useDebatesHub } from './use-debates-hub';

type RenderRow = (userKey: string, slots: FreeSlot[], entry: ScheduleEntry) => React.ReactNode;

/**
 * The calendar on a phone (GEO-3152): the same week, as a list grouped by day. One row per person
 * per day, their half-hours that day as chips, in the same order an hour's list uses; the viewer's
 * own debates sit among them at their time.
 *
 * A grid seven columns wide does not fit a phone, and hover cards need a pointer. Each row here
 * already is the card, so there is nothing to open.
 */
export function CalendarDayList({
  days,
  cells,
  debates,
  opponentName,
  renderRow,
}: {
  days: Date[];
  cells: ReadonlyMap<string, CellPerson[]>;
  debates: OwnDebate[];
  opponentName: (userId: string | null) => string | null;
  renderRow: RenderRow;
}) {
  const byDay = React.useMemo(() => {
    const today = new Date().toDateString();
    return days.slice(0, DAYS_IN_WEEK).map((date, day) => {
      // A person's place in the day is their first free hour; their order within it is the cell's.
      const people = new Map<string, { slots: FreeSlot[]; firstHour: number; rank: number }>();
      for (let hour = 0; hour < HOURS_IN_DAY; hour++) {
        (cells.get(cellKey(day, hour)) ?? []).forEach(({ userKey, slots }, rank) => {
          const known = people.get(userKey);
          if (known) known.slots.push(...slots);
          else people.set(userKey, { slots: [...slots], firstHour: hour, rank });
        });
      }
      const ordered = [...people]
        .sort(([, left], [, right]) => left.firstHour - right.firstHour || left.rank - right.rank)
        .map(([userKey, { slots }]) => ({ userKey, slots }));
      const own = debates.filter(debate => cellOf(debate.start, days)?.day === day);
      // Composed rather than formatted together: en-US writes the pair as `8 Thu`.
      const label = `${date.toLocaleDateString(undefined, { weekday: 'short' })} ${date.getDate()}`;
      return {
        key: date.getTime(),
        label: date.toDateString() === today ? `Today, ${label}` : label,
        people: ordered,
        own,
      };
    });
  }, [cells, days, debates]);

  return (
    <div className="-mx-4 flex flex-col">
      {byDay
        .filter(day => day.people.length > 0 || day.own.length > 0)
        .map(day => (
          <section key={day.key} aria-label={day.label}>
            <Text as="h2" variant="listSemibold" className="border-b border-grey-02 px-4 pt-3 pb-1.5">
              {day.label}
            </Text>
            <ul className="px-4">
              {day.own.map(debate => (
                <OwnDebateRow key={debate.requestId} debate={debate} opponentName={opponentName} />
              ))}
              {day.people.map(({ userKey, slots }) => (
                <React.Fragment key={userKey}>{renderRow(userKey, slots, 'calendar_card')}</React.Fragment>
              ))}
            </ul>
          </section>
        ))}
    </div>
  );
}

function OwnDebateRow({
  debate,
  opponentName,
}: {
  debate: OwnDebate;
  opponentName: (userId: string | null) => string | null;
}) {
  const { open } = useDebatesHub();
  const name = opponentName(debate.opponentUserId);
  const state = debate.state === 'booked' ? 'booked' : debate.state === 'asked' ? 'asked you' : 'requested';
  return (
    <li className="-mx-4 flex items-center justify-between gap-3 border-b border-grey-02 bg-grey-01 px-4 py-2.5">
      <div className="flex min-w-0 flex-col gap-0.5">
        <Text as="p" variant="metadataMedium" className="truncate">
          {name ? `You · Debate with ${name}` : 'You · Debate'}
        </Text>
        <Text as="p" variant="footnote" color="grey-04">
          {timeRangeLabel(debate.start, debate.end)} · {state}
        </Text>
      </div>
      <HubPillButton
        analyticsSurface="calendar"
        analyticsLabel="Debate calendar Own debate"
        onClick={() => open('requests')}
      >
        Open
      </HubPillButton>
    </li>
  );
}
