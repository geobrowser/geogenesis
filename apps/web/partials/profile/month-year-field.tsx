'use client';

import * as React from 'react';

import { MONTH_NAMES, type MonthYear, yearOptions } from '~/core/profile/history-dates';

type Props = {
  label: string;
  value: MonthYear | null;
  onChange: (value: MonthYear | null) => void;
  disabled?: boolean;
};

const selectClassName =
  'appearance-none rounded border border-grey-02 bg-white px-2 py-1.5 text-metadata text-text outline-none transition-colors hover:border-text focus-visible:border-text disabled:cursor-not-allowed disabled:bg-divider disabled:text-grey-03';

/**
 * Month and year, no day.
 *
 * Every date already in the graph lands on the first of a month and most on the
 * first of January, so a day picker would advertise a precision nobody has —
 * and nobody filling in a CV remembers which Tuesday they started.
 */
export function MonthYearField({ label, value, onChange, disabled }: Props) {
  const years = React.useMemo(() => yearOptions(), []);

  /**
   * The half-filled pair lives here rather than upstream.
   *
   * A month on its own cannot be stored — the graph wants a whole date — so the
   * field reports `null` until both are chosen. Keeping only what it reported
   * would lose the month the instant it was picked, leaving the year with
   * nothing to pair with and the date silently unset.
   *
   * Seeded once: the sheets own this field's output, and they unmount between
   * openings, so there is no later external value to follow.
   */
  const [month, setMonth] = React.useState(value?.month ?? 0);
  const [year, setYear] = React.useState(value?.year ?? 0);

  const update = (next: { month?: number; year?: number }) => {
    const nextMonth = next.month ?? month;
    const nextYear = next.year ?? year;

    setMonth(nextMonth);
    setYear(nextYear);
    onChange(nextMonth > 0 && nextYear > 0 ? { month: nextMonth, year: nextYear } : null);
  };

  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="text-metadataMedium text-grey-04">{label}</legend>
      <div className="flex items-center gap-2">
        <select
          aria-label={`${label} month`}
          value={month === 0 ? '' : month}
          disabled={disabled}
          onChange={event => update({ month: Number(event.currentTarget.value) })}
          className={selectClassName}
        >
          <option value="">Month</option>
          {MONTH_NAMES.map((name, index) => (
            <option key={name} value={index + 1}>
              {name}
            </option>
          ))}
        </select>

        <select
          aria-label={`${label} year`}
          value={year === 0 ? '' : year}
          disabled={disabled}
          onChange={event => update({ year: Number(event.currentTarget.value) })}
          className={selectClassName}
        >
          <option value="">Year</option>
          {years.map(year => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
      </div>
    </fieldset>
  );
}
