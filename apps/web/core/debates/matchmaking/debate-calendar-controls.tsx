'use client';

import * as React from 'react';

import cx from 'classnames';

import { Text } from '~/design-system/text';

import { CALENDAR_WEEKS, weekOffsetLabels, weekRangeLabel } from './debate-calendar-model';
import { HubPillButton } from './hub-pill-button';

export type WeekDirection = 'previous' | 'next' | 'today';

/**
 * The time, moved on each minute, so slots and debates that pass drop off as the page stays open.
 * Held in state because React Compiler caches a `Date.now()` read in render once per mount.
 */
export function useMinuteClock(): number {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(interval);
  }, []);
  return now;
}

/**
 * The calendar's week row: back, forward, the range, and Today, then whatever the view puts on the
 * right. The week grid carries the zone offset at the top of its time column; the day list has
 * none, so a phone shows it here.
 */
export function CalendarWeekNav({
  days,
  weekOffset,
  onGoToWeek,
  isPhone,
  analyticsLabelPrefix,
  children,
}: {
  days: Date[];
  weekOffset: number;
  /** Clamped by the caller's own setter; named so the caller can record which press it was. */
  onGoToWeek: (next: number, direction: WeekDirection) => void;
  isPhone: boolean;
  /** Prepended to each control's analytics label, so the two views' presses stay apart. */
  analyticsLabelPrefix: string;
  /** Right-aligned after the range: a legend, or the view's own action. */
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 px-6 py-3 md:px-4">
      <HubPillButton
        aria-label="Previous week"
        analyticsSurface="calendar"
        analyticsLabel={`${analyticsLabelPrefix} Previous week`}
        disabled={weekOffset === 0}
        onClick={() => onGoToWeek(weekOffset - 1, 'previous')}
        className="w-7 px-0"
      >
        ‹
      </HubPillButton>
      <HubPillButton
        aria-label="Next week"
        analyticsSurface="calendar"
        analyticsLabel={`${analyticsLabelPrefix} Next week`}
        disabled={weekOffset >= CALENDAR_WEEKS - 1}
        onClick={() => onGoToWeek(weekOffset + 1, 'next')}
        className="w-7 px-0"
      >
        ›
      </HubPillButton>
      <Text as="span" variant="listSemibold" className="px-1" aria-live="polite">
        {weekRangeLabel(days)}
      </Text>
      <HubPillButton analyticsSurface="calendar" disabled={weekOffset === 0} onClick={() => onGoToWeek(0, 'today')}>
        Today
      </HubPillButton>
      <span className="flex-1" />
      {children}
      {isPhone ? (
        <Text as="span" variant="footnote" color="grey-04">
          {weekOffsetLabels(days).join(' / ')}
        </Text>
      ) : null}
    </div>
  );
}

/**
 * Two or three exclusive options as one pill: the calendar's Availability | Debates, New match's
 * Recommended | Pick any time. Radios, so arrow-key users and screen readers get one choice.
 */
export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-full border border-grey-02 p-0.5">
      {options.map(option => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={cx(
            'rounded-full px-3 py-1 text-metadata transition-colors',
            value === option.value ? 'bg-text text-white' : 'text-grey-04 hover:text-text'
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
