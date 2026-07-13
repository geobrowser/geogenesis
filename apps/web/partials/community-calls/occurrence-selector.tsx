'use client';

import * as React from 'react';

import { useRouter } from 'next/navigation';

import { formatDateLabel, formatTimeRange } from '~/core/community-calls/format';
import { bucketOccurrences, getOccurrences } from '~/core/community-calls/occurrences';
import { Occurrence } from '~/core/community-calls/types';

import { Dropdown } from '~/design-system/dropdown';

type Props = {
  /** Raw series schedule string (see `core/utils/schedule.ts`) — occurrences are derived
   *  from it locally, no new fetch. */
  schedule: string;
  selectedStartMs: number;
  /** Builds the destination route for a given occurrence (its own `/agenda` or `/details` page). */
  hrefFor: (startMs: number, endMs: number) => string;
};

function occurrenceLabel(o: Occurrence): string {
  return `${formatDateLabel(o.startMs)} · ${formatTimeRange(o.startMs, o.endMs)}`;
}

/**
 * Dropdown to switch between a series' occurrences without leaving the agenda/details
 * page. Grouped Live/Upcoming/Past — `Dropdown` has no native grouping, so each group
 * heading is rendered as its own disabled item.
 */
export function OccurrenceSelector({ schedule, selectedStartMs, hrefFor }: Props) {
  const router = useRouter();
  const { live, upcoming, past } = React.useMemo(() => bucketOccurrences(getOccurrences(schedule)), [schedule]);

  const groups = [
    { heading: 'Live', occurrences: live ? [live] : [] },
    { heading: 'Upcoming', occurrences: upcoming },
    { heading: 'Past', occurrences: past },
  ].filter(g => g.occurrences.length > 0);

  const all = groups.flatMap(g => g.occurrences);
  if (all.length <= 1) return null;

  const options = groups.flatMap((group, groupIndex) => [
    {
      label: group.heading,
      value: `heading-${groupIndex}`,
      disabled: true,
      onClick: () => {},
    },
    ...group.occurrences.map(o => ({
      label: occurrenceLabel(o),
      value: String(o.startMs),
      disabled: false,
      onClick: () => router.push(hrefFor(o.startMs, o.endMs)),
    })),
  ]);

  const selected = all.find(o => o.startMs === selectedStartMs);

  return (
    <Dropdown
      trigger={<span>{selected ? occurrenceLabel(selected) : 'Select occurrence'}</span>}
      align="start"
      scrollableList
      options={options}
    />
  );
}
