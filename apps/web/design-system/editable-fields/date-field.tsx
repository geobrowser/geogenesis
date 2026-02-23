'use client';

import { cva } from 'class-variance-authority';
import cx from 'classnames';
import { AnimatePresence, motion } from 'framer-motion';

import * as React from 'react';

import { FORMAT_PROPERTY } from '~/core/constants';
import { useFieldWithValidation } from '~/core/hooks/use-field-with-validation';
import { useFormWithValidation } from '~/core/hooks/use-form-with-validation';
import { useQueryEntity } from '~/core/sync/use-store';
import type { DataType } from '~/core/types';
import { GeoDate } from '~/core/utils/utils';

import { SmallButton } from '~/design-system/button';
import { Minus } from '~/design-system/icons/minus';
import { Spacer } from '~/design-system/spacer';

interface DateFieldProps {
  onBlur?: ({ value, format }: { value: string; format?: string }) => void;
  variant?: 'body' | 'tableCell' | 'tableProperty';
  value: string;
  isEditing?: boolean;
  className?: string;
  propertyId: string;
  dataType?: DataType;
}

interface DateInputProps {
  variant?: 'body' | 'tableCell' | 'tableProperty';
  initialDate: string;
  onDateChange: (date: string) => void;
  label?: string;
}

const dateTextStyles = cva('', {
  variants: {
    variant: {
      body: 'text-body text-text',
      tableCell: 'text-tableCell text-text',
      tableProperty: 'text-tableProperty! text-grey-04!',
    },
  },
  defaultVariants: {
    variant: 'body',
  },
});

const dateFieldStyles = cva(
  'w-full bg-transparent text-center tabular-nums transition-colors duration-75 ease-in-out placeholder:text-grey-02 focus:outline-hidden',
  {
    variants: {
      variant: {
        body: 'text-body',
        tableCell: 'text-tableCell',
        tableProperty: 'text-tableProperty! text-grey-04!',
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

const timeStyles = cva('m-0 w-[21px] bg-transparent p-0 tabular-nums placeholder:text-grey-02 focus:outline-hidden', {
  variants: {
    variant: {
      body: 'text-body',
      tableCell: 'text-tableCell',
      tableProperty: 'text-tableProperty! text-grey-04!',
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

// Shared error message component for animated validation errors
function ErrorMessage({ show, message }: { show: boolean; message: string }) {
  if (!show) return null;

  return (
    <motion.p
      className="mt-2 text-smallButton text-red-01"
      initial={{ opacity: 0, y: -5 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -5 }}
      transition={{ duration: 0.15, bounce: 0.2 }}
    >
      {message}
    </motion.p>
  );
}

// Shared validator configs
const dayValidator = {
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
};

const monthValidator = {
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
};

const yearValidator = {
  validate: (v: string) => {
    const regex = /^[0-9]*$/;

    if (v !== '') {
      if (!regex.test(v)) throw new Error('Year must be a number.');
      if (v.length < 4) throw new Error('Year must be 4 characters.');
    }

    return true;
  },
};

const hourValidator = {
  validate: (v: string) => {
    const regex = /^[0-9]*$/;

    if (v !== '') {
      if (!regex.test(v)) throw new Error('Hour must be a number.');
      if (Number(v) > 12) throw new Error('Hour must be 12 or less.');
      if (Number(v) < 1) throw new Error('Hour must be greater than 0.');
    }

    return true;
  },
};

const minuteValidator = {
  validate: (v: string) => {
    const regex = /^[0-9]*$/;

    if (v !== '') {
      if (!regex.test(v)) throw new Error('Minute must be a number.');
      if (Number(v) > 59) throw new Error('Minute must be 59 or less.');
      if (Number(v) < 0) throw new Error('Minute must be 0 or greater.');
    }

    return true;
  },
};

const dateFormValidator = (values: { day: string; month: string; year: string }) => {
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
};

const timeFormValidator = (values: { hour: string; minute: string }) => {
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
};

const VALID_YEAR_LENGTH = 4;
const VALID_MONTH_LENGTH = 2;
const VALID_DAY_LENGTH = 2;
const VALID_HOUR_LENGTH = 2;
const VALID_MINUTE_LENGTH = 2;

// Default display formats per data type
const DATE_ONLY_FORMAT = 'MMM d, yyyy';
const TIME_ONLY_FORMAT = 'h:mm aaa';
const DATETIME_FORMAT = 'MMM d, yyyy - h:mm aaa';

function getDefaultFormatForDataType(dataType?: DataType): string {
  switch (dataType) {
    case 'DATE':
      return DATE_ONLY_FORMAT;
    case 'TIME':
      return TIME_ONLY_FORMAT;
    case 'DATETIME':
    default:
      return DATETIME_FORMAT;
  }
}

// Helper to set up select-all-on-focus behavior for inputs
function useSelectAllOnFocus(refs: React.RefObject<HTMLInputElement | null>[]) {
  React.useEffect(() => {
    const selectAllOnFocus = (event: FocusEvent) => {
      const input = event.target as HTMLInputElement;
      if (input.type === 'text' || input.type === '') {
        queueMicrotask(() => {
          input.select();
        });
      }
    };

    const inputs = refs.map(ref => ref.current).filter(Boolean);
    inputs.forEach(input => input?.addEventListener('focus', selectAllOnFocus));

    return () => {
      inputs.forEach(input => input?.removeEventListener('focus', selectAllOnFocus));
    };
  }, [refs]);
}

/**
 * DateOnlyInput - handles DATE dataType
 * Only shows date fields (year, month, day)
 * Serializes to date-only ISO string (YYYY-MM-DDT00:00:00.000Z)
 */
function DateOnlyInput({ variant, initialDate, onDateChange, label }: DateInputProps) {
  const { day: initialDay, month: initialMonth, year: initialYear } = GeoDate.fromISOStringUTC(initialDate);

  const formattedInitialDay = initialDay === '' ? initialDay : initialDay.padStart(2, '0');
  const formattedInitialMonth = initialMonth === '' ? initialMonth : initialMonth.padStart(2, '0');
  const formattedInitialYear = initialYear === '' ? initialYear : initialYear.padStart(4, '0');

  const [day, setDay] = useFieldWithValidation(formattedInitialDay, dayValidator);
  const [month, setMonth] = useFieldWithValidation(formattedInitialMonth, monthValidator);
  const [year, setYear] = useFieldWithValidation(formattedInitialYear, yearValidator);

  const [dateFormState] = useFormWithValidation(
    { day: day.value, month: month.value, year: year.value },
    dateFormValidator
  );

  const [yearTouched, setYearTouched] = React.useState(false);
  const [monthTouched, setMonthTouched] = React.useState(false);
  const [dayTouched, setDayTouched] = React.useState(false);

  const yearInputRef = React.useRef<HTMLInputElement>(null);
  const monthInputRef = React.useRef<HTMLInputElement>(null);
  const dayInputRef = React.useRef<HTMLInputElement>(null);

  useSelectAllOnFocus([yearInputRef, monthInputRef, dayInputRef]);

  const isValidYear =
    year.value === '' ||
    (!year.isValidating && year.isValid) ||
    (!yearTouched && year.value.length < VALID_YEAR_LENGTH);

  const isValidMonth =
    month.value === '' ||
    (!month.isValidating && month.isValid) ||
    (!monthTouched && month.value.length < VALID_MONTH_LENGTH) ||
    !dateFormState.isValid;

  const isValidDay =
    day.value === '' || (!day.isValidating && day.isValid) || (!dayTouched && day.value.length < VALID_DAY_LENGTH);

  const updateDate = () => {
    let newDay = day.value;
    let newMonth = month.value;
    let newYear = year.value;

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

    const isValidDayCheck = day.value !== '' || (!day.isValidating && day.isValid);
    const isValidMonthCheck = month.value !== '' || (!month.isValidating && month.isValid) || !dateFormState.isValid;
    const isValidYearCheck = year.value !== '' || (!year.isValidating && year.isValid);
    const isValid = isValidDayCheck && isValidMonthCheck && isValidYearCheck && dateFormState.isValid;

    if (isValid) {
      // Pass empty hour to produce date-only ISO string
      const isoString = GeoDate.toISOStringUTC({
        day: newDay,
        month: newMonth,
        year: newYear,
        hour: '',
        minute: '',
      });

      onDateChange(isoString);
    }
  };

  const onDayChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.currentTarget.value;
    const regex = /^[0-9]*$/;

    if (!regex.test(value)) return;
    if (value.length > 2) return;
    setDay(value);
    setDayTouched(false);
    // No auto-focus to time fields for DATE-only
  };

  const onMonthChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.currentTarget.value;
    const regex = /^[0-9]*$/;

    if (!regex.test(value)) return;
    if (value.length > 2) return;
    setMonth(value);
    setMonthTouched(false);

    if (value.length === 2) {
      queueMicrotask(() => {
        dayInputRef.current?.focus();
      });
    }
  };

  const onYearChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.currentTarget.value;
    const regex = /^[0-9]*$/;

    if (!regex.test(value)) return;
    if (value.length > 4) return;
    setYear(value);
    setYearTouched(false);

    if (value.length === 4) {
      queueMicrotask(() => {
        monthInputRef.current?.focus();
      });
    }
  };

  return (
    <div className="flex flex-col">
      {label && <p className="text-grey-05 mb-2 text-sm font-medium">{label}</p>}
      <div className="flex items-start justify-between gap-3">
        <div className="flex w-[136px] items-center gap-1">
          <div className="flex flex-6 flex-col">
            <input
              ref={yearInputRef}
              value={year.value}
              onChange={onYearChange}
              onBlur={() => {
                setYearTouched(true);
                updateDate();
              }}
              placeholder="YYYY"
              className={`${dateFieldStyles({ variant, error: !isValidYear || !dateFormState.isValid })} text-start`}
            />
          </div>

          <span className="size flex flex-1 justify-center text-lg text-grey-02">/</span>

          <div className="flex flex-4 flex-col">
            <input
              ref={monthInputRef}
              value={month.value}
              onChange={onMonthChange}
              onBlur={() => {
                setMonthTouched(true);
                updateDate();
              }}
              placeholder="MM"
              className={dateFieldStyles({
                variant,
                error: !isValidMonth || !dateFormState.isValid,
              })}
            />
          </div>

          <span className="size flex flex-1 justify-center text-lg text-grey-02">/</span>

          <div className="flex flex-4 flex-col">
            <input
              ref={dayInputRef}
              value={day.value}
              onChange={onDayChange}
              onBlur={() => {
                setDayTouched(true);
                updateDate();
              }}
              placeholder="DD"
              className={dateFieldStyles({
                variant,
                error: !isValidDay || !dateFormState.isValid,
              })}
            />
          </div>
        </div>
      </div>

      <AnimatePresence mode="wait">
        <div className="overflow-hidden">
          <ErrorMessage show={!isValidDay} message="Entered day is not valid" />
          <ErrorMessage show={!isValidMonth} message="Entered month is not valid" />
          <ErrorMessage show={!isValidYear} message="Entered year is not valid" />
          <ErrorMessage show={!dateFormState.isValid} message={dateFormState.error ?? ''} />
        </div>
      </AnimatePresence>
    </div>
  );
}

/**
 * TimeOnlyInput - handles TIME dataType
 * Only shows time fields (hour, minute, meridiem)
 * Serializes to ISO string with fixed date 1970-01-01
 */
function TimeOnlyInput({ variant, initialDate, onDateChange, label }: DateInputProps) {
  const { hour: initialHour, minute: initialMinute, meridiem: initialMeridiem } = GeoDate.fromISOStringUTC(initialDate);

  const formattedInitialHour =
    initialHour === '' ? initialHour : initialHour.padStart(2, '0') === '00' ? '12' : initialHour.padStart(2, '0');
  const formattedInitialMinute = initialMinute === '' ? initialMinute : initialMinute.padStart(2, '0');

  const [hour, setHour] = useFieldWithValidation(formattedInitialHour, hourValidator);
  const [minute, setMinute] = useFieldWithValidation(formattedInitialMinute, minuteValidator);
  const [meridiem, setMeridiem] = React.useState<'am' | 'pm'>(initialMeridiem);

  const [timeFormState] = useFormWithValidation({ hour: hour.value, minute: minute.value }, timeFormValidator);

  const [hourTouched, setHourTouched] = React.useState(false);
  const [minuteTouched, setMinuteTouched] = React.useState(false);

  const hourInputRef = React.useRef<HTMLInputElement>(null);
  const minuteInputRef = React.useRef<HTMLInputElement>(null);
  const meridiemButtonRef = React.useRef<HTMLButtonElement>(null);

  useSelectAllOnFocus([hourInputRef, minuteInputRef]);

  const isValidHour =
    hour.value === '' ||
    (!hour.isValidating && hour.isValid) ||
    (!hourTouched && hour.value.length < VALID_HOUR_LENGTH);

  const isValidMinute =
    minute.value === '' ||
    (!minute.isValidating && minute.isValid) ||
    (!minuteTouched && minute.value.length < VALID_MINUTE_LENGTH);

  const updateTime = (newMeridiem: 'am' | 'pm') => {
    let newMinute = minute.value;
    let newHour = hour.value;

    if (Number(minute.value) < 10 && minute.value !== '') {
      newMinute = minute.value.padStart(2, '0');
      setMinute(newMinute);
    }

    if (Number(hour.value) < 10 && hour.value !== '') {
      newHour = hour.value.padStart(2, '0');
      setHour(newHour);
    }

    if (Number(hour.value) === 12) {
      newHour = '00';
    }

    const isValidHourCheck = hour.value === '' || (!hour.isValidating && hour.isValid);
    const isValidMinuteCheck = minute.value === '' || (!minute.isValidating && minute.isValid);
    const isValid = isValidHourCheck && isValidMinuteCheck && timeFormState.isValid;

    if (isValid) {
      // Use fixed date 1970-01-01 for TIME-only values
      const isoString = GeoDate.toISOStringUTC({
        day: '01',
        month: '01',
        year: '1970',
        hour: newMeridiem === 'am' ? newHour : (Number(newHour) + 12).toString(),
        minute: newMinute,
      });

      onDateChange(isoString);
    }
  };

  const onToggleMeridiem = () => {
    const newMeridiem = meridiem === 'am' ? 'pm' : 'am';
    updateTime(newMeridiem);
    setMeridiem(newMeridiem);
  };

  const onHourChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.currentTarget.value;
    const regex = /^[0-9]*$/;

    if (!regex.test(value)) return;
    if (value.length > 2) return;
    setHour(value);
    setHourTouched(false);

    if (value.length === 2) {
      queueMicrotask(() => {
        minuteInputRef.current?.focus();
      });
    }
  };

  const onMinuteChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.currentTarget.value;
    const regex = /^[0-9]*$/;

    if (!regex.test(value)) return;
    if (value.length > 2) return;
    setMinute(value);
    setMinuteTouched(false);

    if (value.length === 2) {
      queueMicrotask(() => {
        meridiemButtonRef.current?.focus();
      });
    }
  };

  return (
    <div className="flex flex-col">
      {label && <p className="text-grey-05 mb-2 text-sm font-medium">{label}</p>}
      <div className="flex items-start justify-between gap-3">
        <div className="flex grow items-center">
          <div className="flex items-center gap-1">
            <input
              ref={hourInputRef}
              value={hour.value}
              onChange={onHourChange}
              onBlur={() => {
                setHourTouched(true);
                updateTime(meridiem);
              }}
              placeholder="00"
              className={timeStyles({ variant, error: !isValidHour || !timeFormState.isValid })}
            />

            <span>:</span>
            <input
              ref={minuteInputRef}
              value={minute.value}
              onChange={onMinuteChange}
              onBlur={() => {
                setMinuteTouched(true);
                updateTime(meridiem);
              }}
              placeholder="00"
              className={timeStyles({ variant, error: !isValidMinute || !timeFormState.isValid })}
            />
          </div>

          <Spacer width={12} />
          <motion.div whileTap={{ scale: 0.95 }} className="focus:outline-hidden">
            <SmallButton
              ref={meridiemButtonRef}
              onClick={() => onToggleMeridiem()}
              variant="secondary"
              className="whitespace-nowrap uppercase"
            >
              {meridiem}
            </SmallButton>
          </motion.div>
        </div>
      </div>

      <AnimatePresence mode="wait">
        <div className="overflow-hidden">
          <ErrorMessage show={!isValidHour} message="Entered hour is not valid. Please use a 12 hour format." />
          <ErrorMessage show={!isValidMinute} message="Entered minute is not valid." />
          <ErrorMessage show={!timeFormState.isValid} message={timeFormState.error ?? ''} />
        </div>
      </AnimatePresence>
    </div>
  );
}

/**
 * DateTimeInput - handles DATETIME dataType (default)
 * Shows all fields: date (year, month, day) and time (hour, minute, meridiem)
 * Serializes to full datetime ISO string
 */
function DateTimeInput({ variant, initialDate, onDateChange, label }: DateInputProps) {
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

  const [day, setDay] = useFieldWithValidation(formattedInitialDay, dayValidator);
  const [month, setMonth] = useFieldWithValidation(formattedInitialMonth, monthValidator);
  const [year, setYear] = useFieldWithValidation(formattedInitialYear, yearValidator);
  const [hour, setHour] = useFieldWithValidation(formattedInitialHour, hourValidator);
  const [minute, setMinute] = useFieldWithValidation(formattedInitialMinute, minuteValidator);
  const [meridiem, setMeridiem] = React.useState<'am' | 'pm'>(initialMeridiem);

  const [dateFormState] = useFormWithValidation(
    { day: day.value, month: month.value, year: year.value },
    dateFormValidator
  );
  const [timeFormState] = useFormWithValidation({ hour: hour.value, minute: minute.value }, timeFormValidator);

  const [yearTouched, setYearTouched] = React.useState(false);
  const [monthTouched, setMonthTouched] = React.useState(false);
  const [dayTouched, setDayTouched] = React.useState(false);
  const [hourTouched, setHourTouched] = React.useState(false);
  const [minuteTouched, setMinuteTouched] = React.useState(false);

  const yearInputRef = React.useRef<HTMLInputElement>(null);
  const monthInputRef = React.useRef<HTMLInputElement>(null);
  const dayInputRef = React.useRef<HTMLInputElement>(null);
  const hourInputRef = React.useRef<HTMLInputElement>(null);
  const minuteInputRef = React.useRef<HTMLInputElement>(null);
  const meridiemButtonRef = React.useRef<HTMLButtonElement>(null);

  useSelectAllOnFocus([yearInputRef, monthInputRef, dayInputRef, hourInputRef, minuteInputRef]);

  const isValidYear =
    year.value === '' ||
    (!year.isValidating && year.isValid) ||
    (!yearTouched && year.value.length < VALID_YEAR_LENGTH);

  const isValidMonth =
    month.value === '' ||
    (!month.isValidating && month.isValid) ||
    (!monthTouched && month.value.length < VALID_MONTH_LENGTH) ||
    !dateFormState.isValid;

  const isValidDay =
    day.value === '' || (!day.isValidating && day.isValid) || (!dayTouched && day.value.length < VALID_DAY_LENGTH);

  const isValidHour =
    hour.value === '' ||
    (!hour.isValidating && hour.isValid) ||
    (!hourTouched && hour.value.length < VALID_HOUR_LENGTH);

  const isValidMinute =
    minute.value === '' ||
    (!minute.isValidating && minute.isValid) ||
    (!minuteTouched && minute.value.length < VALID_MINUTE_LENGTH);

  const updateDate = (newMeridiem: 'am' | 'pm') => {
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

    const isValidDayCheck = day.value !== '' || (!day.isValidating && day.isValid);
    const isValidMonthCheck = month.value !== '' || (!month.isValidating && month.isValid) || !dateFormState.isValid;
    const isValidYearCheck = year.value !== '' || (!year.isValidating && year.isValid);
    const isValidHourCheck = hour.value === '' || (!hour.isValidating && hour.isValid);
    const isValidMinuteCheck = minute.value === '' || (!minute.isValidating && minute.isValid);
    const isValid =
      isValidDayCheck &&
      isValidMonthCheck &&
      isValidYearCheck &&
      dateFormState.isValid &&
      isValidHourCheck &&
      isValidMinuteCheck &&
      timeFormState.isValid;

    if (isValid) {
      const isoString = GeoDate.toISOStringUTC({
        day: newDay,
        month: newMonth,
        year: newYear,
        minute: newMinute,
        hour: newMeridiem === 'am' ? newHour : (Number(newHour) + 12).toString(),
      });

      onDateChange(isoString);
    }
  };

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
    setDayTouched(false);

    // Auto-focus to hour field when 2 digits are entered for day
    if (value.length === 2) {
      queueMicrotask(() => {
        hourInputRef.current?.focus();
      });
    }
  };

  const onMonthChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.currentTarget.value;
    const regex = /^[0-9]*$/;

    if (!regex.test(value)) return;
    if (value.length > 2) return;
    setMonth(value);
    setMonthTouched(false);

    if (value.length === 2) {
      queueMicrotask(() => {
        dayInputRef.current?.focus();
      });
    }
  };

  const onYearChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.currentTarget.value;
    const regex = /^[0-9]*$/;

    if (!regex.test(value)) return;
    if (value.length > 4) return;
    setYear(value);
    setYearTouched(false);

    if (value.length === 4) {
      queueMicrotask(() => {
        monthInputRef.current?.focus();
      });
    }
  };

  const onMinuteChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.currentTarget.value;
    const regex = /^[0-9]*$/;

    if (!regex.test(value)) return;
    if (value.length > 2) return;
    setMinute(value);
    setMinuteTouched(false);

    if (value.length === 2) {
      queueMicrotask(() => {
        meridiemButtonRef.current?.focus();
      });
    }
  };

  const onHourChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.currentTarget.value;
    const regex = /^[0-9]*$/;

    if (!regex.test(value)) return;
    if (value.length > 2) return;
    setHour(value);
    setHourTouched(false);

    if (value.length === 2) {
      queueMicrotask(() => {
        minuteInputRef.current?.focus();
      });
    }
  };

  return (
    <div className="flex flex-col">
      {label && <p className="text-grey-05 mb-2 text-sm font-medium">{label}</p>}
      <div className="flex items-start justify-between gap-3">
        <div className="flex w-[136px] items-center gap-1">
          <div className="flex flex-6 flex-col">
            <input
              ref={yearInputRef}
              value={year.value}
              onChange={onYearChange}
              onBlur={() => {
                setYearTouched(true);
                updateDate(meridiem);
              }}
              placeholder="YYYY"
              className={`${dateFieldStyles({ variant, error: !isValidYear || !dateFormState.isValid })} text-start`}
            />
          </div>

          <span className="size flex flex-1 justify-center text-lg text-grey-02">/</span>

          <div className="flex flex-4 flex-col">
            <input
              ref={monthInputRef}
              value={month.value}
              onChange={onMonthChange}
              onBlur={() => {
                setMonthTouched(true);
                updateDate(meridiem);
              }}
              placeholder="MM"
              className={dateFieldStyles({
                variant,
                error: !isValidMonth || !dateFormState.isValid,
              })}
            />
          </div>

          <span className="size flex flex-1 justify-center text-lg text-grey-02">/</span>

          <div className="flex flex-4 flex-col">
            <input
              ref={dayInputRef}
              value={day.value}
              onChange={onDayChange}
              onBlur={() => {
                setDayTouched(true);
                updateDate(meridiem);
              }}
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
              ref={hourInputRef}
              value={hour.value}
              onChange={onHourChange}
              onBlur={() => {
                setHourTouched(true);
                updateDate(meridiem);
              }}
              placeholder="00"
              className={timeStyles({ variant, error: !isValidHour || !timeFormState.isValid })}
            />

            <span>:</span>
            <input
              ref={minuteInputRef}
              value={minute.value}
              onChange={onMinuteChange}
              onBlur={() => {
                setMinuteTouched(true);
                updateDate(meridiem);
              }}
              placeholder="00"
              className={timeStyles({ variant, error: !isValidMinute || !timeFormState.isValid })}
            />
          </div>

          <Spacer width={12} />
          <motion.div whileTap={{ scale: 0.95 }} className="focus:outline-hidden">
            <SmallButton
              ref={meridiemButtonRef}
              onClick={() => onToggleMeridiem()}
              variant="secondary"
              className="whitespace-nowrap uppercase"
            >
              {meridiem}
            </SmallButton>
          </motion.div>
        </div>
      </div>

      <AnimatePresence mode="wait">
        <div className="overflow-hidden">
          <ErrorMessage show={!isValidHour} message="Entered hour is not valid. Please use a 12 hour format." />
          <ErrorMessage show={!isValidMinute} message="Entered minute is not valid." />
          <ErrorMessage show={!isValidDay} message="Entered day is not valid" />
          <ErrorMessage show={!isValidMonth} message="Entered month is not valid" />
          <ErrorMessage show={!isValidYear} message="Entered year is not valid" />
          <ErrorMessage show={!dateFormState.isValid} message={dateFormState.error ?? ''} />
          <ErrorMessage show={!timeFormState.isValid} message={timeFormState.error ?? ''} />
        </div>
      </AnimatePresence>
    </div>
  );
}

/**
 * Internal DateInput dispatcher - routes to the appropriate variant based on dataType
 */
function DateInput({ variant, initialDate, onDateChange, label, dataType }: DateInputProps & { dataType?: DataType }) {
  switch (dataType) {
    case 'DATE':
      return <DateOnlyInput variant={variant} initialDate={initialDate} onDateChange={onDateChange} label={label} />;
    case 'TIME':
      return <TimeOnlyInput variant={variant} initialDate={initialDate} onDateChange={onDateChange} label={label} />;
    case 'DATETIME':
    default:
      return <DateTimeInput variant={variant} initialDate={initialDate} onDateChange={onDateChange} label={label} />;
  }
}

export function DateField({ value, isEditing, variant, onBlur, className = '', propertyId, dataType }: DateFieldProps) {
  const isDateInterval = React.useMemo(() => GeoDate.isDateInterval(value), [value]);
  const [intervalError, setIntervalError] = React.useState<string | null>(null);

  const { entity } = useQueryEntity({ id: propertyId });

  const format = entity?.values.find(value => value.property.id === FORMAT_PROPERTY)?.value;

  const [startDate, endDate] = React.useMemo(() => {
    if (isDateInterval && value) {
      const dateStrings = value.split(GeoDate.intervalDelimiter).map(d => d.trim());
      return [dateStrings[0], dateStrings[1] || dateStrings[0]];
    }
    return [value, value];
  }, [value, isDateInterval]);

  // Use entity format if provided, otherwise use dataType-specific default
  const displayFormat = format || getDefaultFormatForDataType(dataType);
  const formattedDate = value ? GeoDate.format(value, displayFormat) : null;

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
      <p className={dateTextStyles({ variant, className })} data-testid="date-field-value">
        {formattedDate}
      </p>
    );

  return (
    <div className={cx('flex flex-col gap-1', className)}>
      <div className="flex flex-row items-start gap-4">
        <DateInput variant={variant} initialDate={startDate} onDateChange={handleStartDateChange} dataType={dataType} />

        {isDateInterval && (
          <>
            <span>—</span>
            <DateInput variant={variant} initialDate={endDate} onDateChange={handleEndDateChange} dataType={dataType} />
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
