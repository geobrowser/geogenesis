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

/** Arrow keys step through a radio group, wrapping; Home and End jump to its ends. */
const RADIO_STEPS: Record<string, (index: number, count: number) => number> = {
  ArrowRight: (index, count) => (index + 1) % count,
  ArrowDown: (index, count) => (index + 1) % count,
  ArrowLeft: (index, count) => (index - 1 + count) % count,
  ArrowUp: (index, count) => (index - 1 + count) % count,
  Home: () => 0,
  End: (_, count) => count - 1,
};

/**
 * Two or three exclusive options as one pill: the calendar's Availability | Admin, New match's
 * Recommended | Pick any time. A radio group, so it behaves as one: a single tab stop on the
 * checked option, and the arrow keys move the choice and the focus together.
 */
export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
  variant = 'outline',
  size = 'default',
  className,
  optionAttributes,
}: {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  /**
   * `outline`, the calendar's: a bordered pill with the choice filled black. `tinted`, the side
   * panel's Filters (GEO-3463): a grey track the full width of its row, the choice raised in white.
   */
  variant?: 'outline' | 'tinted';
  /** `tinted` only: `large` is the phone sheet's 32px track with 16px words; desktop is 26px and 14px. */
  size?: 'default' | 'large';
  /** On the track. `tinted` fills its row unless told a width (Requests' All / Needs you is 220px). */
  className?: string;
  /** Per-option attributes, for a surface that labels each choice's clicks (analytics). */
  optionAttributes?: (option: { value: T; label: string }) => Record<string, string | undefined>;
}) {
  const buttons = React.useRef<(HTMLButtonElement | null)[]>([]);
  const onKeyDown = (event: React.KeyboardEvent, index: number) => {
    const step = RADIO_STEPS[event.key];
    if (!step) return;
    event.preventDefault();
    const next = step(index, options.length);
    onChange(options[next].value);
    buttons.current[next]?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cx(
        'flex rounded-full p-0.5',
        variant === 'tinted' ? 'w-full bg-grey-01' : 'border border-grey-02',
        className
      )}
    >
      {options.map((option, index) => (
        <button
          key={option.value}
          ref={element => {
            buttons.current[index] = element;
          }}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          tabIndex={value === option.value ? 0 : -1}
          {...optionAttributes?.(option)}
          onClick={() => onChange(option.value)}
          onKeyDown={event => onKeyDown(event, index)}
          className={cx(
            'rounded-full transition-colors',
            variant === 'tinted'
              ? cx(
                  // Equal shares of the track, the words centred in each with room either side: the
                  // prototype's `.seg button { flex: 1 }`.
                  'inline-flex min-w-0 flex-1 basis-0 items-center justify-center px-3 text-center whitespace-nowrap',
                  size === 'large' ? 'h-8 text-metadata' : 'h-[26px] text-breadcrumb',
                  value === option.value
                    ? 'bg-white text-text shadow-[0_1px_2px_rgba(0,0,0,0.12)]'
                    : 'text-grey-04 hover:text-text'
                )
              : cx(
                  'px-3 py-1 text-metadata',
                  value === option.value ? 'bg-text text-white' : 'text-grey-04 hover:text-text'
                )
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
