'use client';

import { cva } from 'class-variance-authority';
import { AnimatePresence, motion } from 'framer-motion';

import * as React from 'react';

import { useFieldWithValidation } from '~/core/hooks/use-field-with-validation';
import { useFormWithValidation } from '~/core/hooks/use-form-with-validation';
import { GeoDate } from '~/core/utils/utils';

import { SmallButton } from '~/design-system/button';
import { Minus } from '~/design-system/icons/minus';
import { Spacer } from '~/design-system/spacer';

interface DateFieldProps {
  onBlur?: ({ value, format }: { value: string; format?: string }) => void;
  variant?: 'body' | 'tableCell';
  value: string;
  format?: string;
  isEditing?: boolean;
}

interface DateInputProps {
  variant?: 'body' | 'tableCell';
  initialDate: string;
  onDateChange: (date: string) => void;
  label?: string;
}

const dateFieldStyles = cva(
  'w-full bg-transparent text-center tabular-nums transition-colors duration-75 ease-in-out placeholder:text-grey-02 focus:outline-none',
  {
    variants: {
      variant: {
        body: 'text-body',
        tableCell: 'text-tableCell',
      },
      error: {
        true: 'text-red-01',
      },
    },
    defaultVariants: {
      variant: 'body',
      error: false,
    },
  }
);

const timeStyles = cva('m-0 w-[21px] bg-transparent p-0 tabular-nums placeholder:text-grey-02 focus:outline-none', {
  variants: {
    variant: {
      body: 'text-body',
      tableCell: 'text-tableCell',
    },
    error: {
      true: 'text-red-01',
    },
  },
  defaultVariants: {
    variant: 'body',
    error: false,
  },
});

function DateInput({ variant, initialDate, onDateChange, label }: DateInputProps) {
  const {
    day: initialDay,
    month: initialMonth,
    year: initialYear,
    hour: initialHour,
    minute: initialMinute,
    meridiem: initialMeridiem,
  } = GeoDate.fromISOStringUTC(initialDate);

  const formattedInitialDay = initialDay === '' ? initialDay : initialDay.padStart(2, '0');
  const formattedInitialMonth = initialMonth === '' ? initialMonth : initialMonth.padStart(2, '0');
  const formattedInitialYear = initialYear === '' ? initialYear : initialYear.padStart(4, '0');
  const formattedInitialHour =
    initialHour === '' ? initialHour : initialHour.padStart(2, '0') === '00' ? '12' : initialHour.padStart(2, '0');
  const formattedInitialMinute = initialMinute === '' ? initialMinute : initialMinute.padStart(2, '0');

  const [day, setDay] = useFieldWithValidation(formattedInitialDay, {
    validate: (v: string) => {
      const regex = /^[0-9]*$/;

      if (v !== '') {
        if (!regex.test(v)) throw new Error('Day must be a number.');
        if (v.length > 2) throw new Error("Day can't be longer than 2 characters.");
        if (Number(v) > 31) throw new Error('Day must be less than 31.');
        if (Number(v) < 1) throw new Error('Day must be greater than 0.');
      }

      return true;
    },
  });

  const [month, setMonth] = useFieldWithValidation(formattedInitialMonth, {
    validate: (v: string) => {
      const regex = /^[0-9]*$/;

      if (v !== '') {
        if (!regex.test(v)) throw new Error('Month must be a number.');
        if (v.length > 2) throw new Error("Month can't be longer than 2 characters.");
        if (Number(v) > 12) throw new Error('Month must be 12 or less.');
        if (Number(v) < 1) throw new Error('Month must be greater than 0.');
      }

      return true;
    },
  });

  const [year, setYear] = useFieldWithValidation(formattedInitialYear, {
    validate: (v: string) => {
      const regex = /^[0-9]*$/;

      if (v !== '') {
        if (!regex.test(v)) throw new Error('Year must be a number.');
        if (v.length < 4) throw new Error('Year must be 4 characters.');
      }

      return true;
    },
  });

  const [hour, setHour] = useFieldWithValidation(formattedInitialHour, {
    validate: (v: string) => {
      const regex = /^[0-9]*$/;

      if (v !== '') {
        if (!regex.test(v)) throw new Error('Hour must be a number.');
        if (Number(v) > 12) throw new Error('Hour must be 12 or less.');
        if (Number(v) < 1) throw new Error('Hour must be greater than 0.');
      }

      return true;
    },
  });

  const [minute, setMinute] = useFieldWithValidation(formattedInitialMinute, {
    validate: (v: string) => {
      const regex = /^[0-9]*$/;

      if (v !== '') {
        if (!regex.test(v)) throw new Error('Minute must be a number.');
        if (Number(v) > 59) throw new Error('Minute must be 59 or less.');
        if (Number(v) < 0) throw new Error('Minute must be 0 or greater.');
      }

      return true;
    },
  });

  const [dateFormState] = useFormWithValidation({ day: day.value, month: month.value, year: year.value }, values => {
    if (values.month !== '') {
      const dayAsNumber = Number(values.day);
      const yearAsNumber = Number(values.year);

      if (dayAsNumber > 30 && GeoDate.isMonth30Days(Number(values.month))) {
        throw new Error('Day must be less than 31 for the entered month.');
      }

      // Check leap year in order to validate February has 29 days
      if (GeoDate.isLeapYear(yearAsNumber)) {
        if (dayAsNumber > 29 && Number(values.month) === 2) {
          throw new Error('Day must be less than 30 for the entered month.');
        }
      } else {
        // Otherwise we validate that February has 28 days
        if (dayAsNumber > 28 && Number(values.month) === 2) {
          throw new Error('Day must be less than 29 for the entered month.');
        }
      }
    }

    return true;
  });

  const [timeFormState] = useFormWithValidation({ hour: hour.value, minute: minute.value }, values => {
    if (values.hour !== '') {
      if (values.minute === '') {
        throw new Error("Must enter a minute if you've entered an hour.");
      }
    }

    if (values.minute !== '') {
      if (values.hour === '') {
        throw new Error("Must enter an hour if you've entered a minute.");
      }
    }

    return true;
  });

  const [meridiem, setMeridiem] = React.useState<'am' | 'pm'>(initialMeridiem);

  const onToggleMeridiem = () => {
    const newMeridiem = meridiem === 'am' ? 'pm' : 'am';
    updateDate(newMeridiem);
    setMeridiem(newMeridiem);
  };

  const onDayChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.currentTarget.value;
    const regex = /^[0-9]*$/;

    if (!regex.test(value)) return;
    if (value.length > 2) return;
    setDay(value);
  };

  const onMonthChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.currentTarget.value;
    const regex = /^[0-9]*$/;

    if (!regex.test(value)) return;
    if (value.length > 2) return;
    setMonth(value);
  };

  const onYearChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.currentTarget.value;
    const regex = /^[0-9]*$/;

    if (!regex.test(value)) return;
    if (value.length > 4) return;
    setYear(value);
  };

  const onMinuteChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.currentTarget.value;
    const regex = /^[0-9]*$/;

    if (!regex.test(value)) return;
    if (value.length > 2) return;

    setMinute(value);
  };

  const onHourChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.currentTarget.value;
    const regex = /^[0-9]*$/;

    if (!regex.test(value)) return;
    if (value.length > 2) return;

    setHour(value);
  };

  const updateDate = (meridiem: 'am' | 'pm') => {
    let newMinute = minute.value;
    let newHour = hour.value;
    let newDay = day.value;
    let newMonth = month.value;
    let newYear = year.value;

    if (Number(minute.value) < 10 && minute.value !== '') {
      newMinute = minute.value.padStart(2, '0');
      setMinute(newMinute);
    }

    if (Number(hour.value) < 10 && hour.value !== '') {
      newHour = hour.value.padStart(2, '0');
      setHour(newHour);
    }

    if (Number(day.value) < 10 && day.value !== '') {
      newDay = day.value.padStart(2, '0');
      setDay(newDay);
    }

    if (Number(month.value) < 10 && month.value !== '') {
      newMonth = month.value.padStart(2, '0');
      setMonth(newMonth);
    }

    if ((Number(year.value) < 1000 || Number(year.value) < 100 || Number(year.value) < 10) && year.value !== '') {
      newYear = year.value.padStart(4, '0');
      setYear(newYear);
    }

    if (Number(hour.value) === 12) {
      newHour = '00';
    }

    const isValidDay = day.value !== '' || (!day.isValidating && day.isValid);
    const isValidMonth = month.value !== '' || (!month.isValidating && month.isValid) || !dateFormState.isValid;
    const isValidYear = year.value !== '' || (!year.isValidating && year.isValid);
    const isValidHour = hour.value === '' || (!hour.isValidating && hour.isValid);
    const isValidMinute = minute.value === '' || (!minute.isValidating && minute.isValid);
    const isValid = isValidDay && isValidMonth && isValidYear && dateFormState.isValid && isValidHour && isValidMinute;

    if (isValid) {
      // GeoDate.toISOStringUTC will throw an error if the date is invalid
      const isoString = GeoDate.toISOStringUTC({
        day: newDay,
        month: newMonth,
        year: newYear,
        minute: newMinute,
        hour: meridiem === 'am' ? newHour : (Number(newHour) + 12).toString(),
      });

      onDateChange(isoString);
    }
  };

  const isValidHour = hour.value === '' || (!hour.isValidating && hour.isValid);
  const isValidMinute = minute.value === '' || (!minute.isValidating && minute.isValid);
  const isValidDay = day.value === '' || (!day.isValidating && day.isValid);
  const isValidMonth = month.value === '' || (!month.isValidating && month.isValid) || !dateFormState.isValid;
  const isValidYear = year.value === '' || (!year.isValidating && year.isValid);

  return (
    <div className="flex flex-col">
      {label && <p className="text-grey-05 mb-2 text-sm font-medium">{label}</p>}
      <div className="flex items-start justify-between gap-3">
        <div className="flex w-[136px] items-center gap-1">
          <div className="flex flex-[6] flex-col">
            <input
              value={year.value}
              onChange={onYearChange}
              onBlur={() => updateDate(meridiem)}
              placeholder="YYYY"
              className={`${dateFieldStyles({ variant, error: !isValidYear || !dateFormState.isValid })} text-start`}
            />
          </div>

          <span className="size flex flex-[1] justify-center text-lg text-grey-02">/</span>

          <div className="flex flex-[4] flex-col">
            <input
              value={month.value}
              onChange={onMonthChange}
              onBlur={() => updateDate(meridiem)}
              placeholder="MM"
              className={dateFieldStyles({
                variant,
                error: !isValidMonth || !dateFormState.isValid,
              })}
            />
          </div>

          <span className="size flex flex-[1] justify-center text-lg text-grey-02">/</span>

          <div className="flex flex-[4] flex-col">
            <input
              value={day.value}
              onChange={onDayChange}
              onBlur={() => updateDate(meridiem)}
              placeholder="DD"
              className={dateFieldStyles({
                variant,
                error: !isValidDay || !dateFormState.isValid,
              })}
            />
          </div>
        </div>
        <div className="flex grow items-center">
          <Minus color="grey-02" className="size-4" />
          <Spacer width={14} />
          <div className="flex items-center gap-1">
            <input
              value={hour.value}
              onChange={onHourChange}
              onBlur={() => updateDate(meridiem)}
              placeholder="00"
              className={timeStyles({ variant, error: !isValidHour || !timeFormState.isValid })}
            />

            <span>:</span>
            <input
              value={minute.value}
              onChange={onMinuteChange}
              onBlur={() => updateDate(meridiem)}
              placeholder="00"
              className={timeStyles({ variant, error: !isValidMinute || !timeFormState.isValid })}
            />
          </div>

          <Spacer width={12} />
          <motion.div whileTap={{ scale: 0.95 }} className="focus:outline-none">
            <SmallButton onClick={() => onToggleMeridiem()} variant="secondary" className="whitespace-nowrap uppercase">
              {meridiem}
            </SmallButton>
          </motion.div>
        </div>
      </div>

      <AnimatePresence mode="wait">
        <div className="overflow-hidden">
          {!isValidHour && (
            <motion.p
              className="mt-2 text-smallButton text-red-01"
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              transition={{ duration: 0.15, bounce: 0.2 }}
            >
              Entered hour is not valid. Please use a 12 hour format.
            </motion.p>
          )}
          {!isValidMinute && (
            <motion.p
              className="mt-2 text-smallButton text-red-01"
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              transition={{ duration: 0.15, bounce: 0.2 }}
            >
              Entered minute is not valid.
            </motion.p>
          )}
          {!isValidDay && (
            <motion.p
              className="mt-2 text-smallButton text-red-01"
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              transition={{ duration: 0.15, bounce: 0.2 }}
            >
              Entered day is not valid
            </motion.p>
          )}
          {!isValidMonth && (
            <motion.p
              className="mt-2 text-smallButton text-red-01"
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              transition={{ duration: 0.15, bounce: 0.2 }}
            >
              Entered month is not valid
            </motion.p>
          )}
          {!isValidYear && (
            <motion.p
              className="mt-2 text-smallButton text-red-01"
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              transition={{ duration: 0.15, bounce: 0.2 }}
            >
              Entered year is not valid
            </motion.p>
          )}
          {!dateFormState.isValid && (
            <motion.p
              className="mt-2 text-smallButton text-red-01"
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              transition={{ duration: 0.15, bounce: 0.2 }}
            >
              {dateFormState.error}
            </motion.p>
          )}
          {!timeFormState.isValid && (
            <motion.p
              className="mt-2 text-smallButton text-red-01"
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              transition={{ duration: 0.15, bounce: 0.2 }}
            >
              {timeFormState.error}
            </motion.p>
          )}
        </div>
      </AnimatePresence>
    </div>
  );
}

export function DateField({ value, format, isEditing, variant, onBlur }: DateFieldProps) {
  const isDateInterval = React.useMemo(() => GeoDate.isDateInterval(value), [value]);
  const [intervalError, setIntervalError] = React.useState<string | null>(null);

  const [startDate, endDate] = React.useMemo(() => {
    if (isDateInterval && value) {
      const dateStrings = value.split(GeoDate.intervalDelimiter).map(d => d.trim());
      return [dateStrings[0], dateStrings[1] || dateStrings[0]];
    }
    return [value, value];
  }, [value, isDateInterval]);

  const formattedDate = value ? GeoDate.format(value, format) : null;

  const validateDateInterval = React.useCallback((start: string, end: string): boolean => {
    const startDate = new Date(start);
    const endDate = new Date(end);

    if (startDate > endDate) {
      setIntervalError('End date cannot be before start date');
      return false;
    }

    setIntervalError(null);
    return true;
  }, []);

  const handleStartDateChange = (newStartDate: string) => {
    if (!onBlur) return;

    if (isDateInterval) {
      const isValid = validateDateInterval(newStartDate, endDate);

      if (isValid) {
        onBlur({
          value: `${newStartDate}${GeoDate.intervalDelimiter}${endDate}`,
          format: format,
        });
      }
    } else {
      onBlur({
        value: newStartDate,
        format: format,
      });
    }
  };

  const handleEndDateChange = (newEndDate: string) => {
    if (!onBlur || !isDateInterval) return;

    const isValid = validateDateInterval(startDate, newEndDate);

    if (isValid) {
      onBlur({
        value: `${startDate}${GeoDate.intervalDelimiter}${newEndDate}`,
        format: format,
      });
    }
  };

  if (!isEditing)
    return (
      <p className="text-body text-text" data-testid="date-field-value">
        {formattedDate}
      </p>
    );

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-row items-start gap-4">
        <DateInput variant={variant} initialDate={startDate} onDateChange={handleStartDateChange} />

        {isDateInterval && (
          <>
            <span>—</span>
            <DateInput variant={variant} initialDate={endDate} onDateChange={handleEndDateChange} />
          </>
        )}
      </div>

      <AnimatePresence mode="wait">
        <div className="overflow-hidden">
          {intervalError && (
            <motion.p
              className="text-smallButton text-red-01"
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              transition={{ duration: 0.15, bounce: 0.2 }}
            >
              {intervalError}
            </motion.p>
          )}
        </div>
      </AnimatePresence>

      {formattedDate && <span className="text-sm text-grey-04">Browse format · {formattedDate}</span>}
    </div>
  );
}
