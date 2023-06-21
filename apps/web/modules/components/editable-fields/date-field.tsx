import * as React from 'react';
import { cva } from 'class-variance-authority';
import { AnimatePresence, motion } from 'framer-motion';
import { GeoDate } from '~/modules/utils';
import { Minus } from '~/modules/design-system/icons/minus';
import { Spacer } from '~/modules/design-system/spacer';
import { SmallButton } from '~/modules/design-system/button';
import { useFieldWithValidation } from '~/modules/hooks/use-field-with-validation';
import { useFormWithValidation } from '~/modules/hooks/use-form-with-validation';

interface DateFieldProps {
  onBlur?: (date: string) => void;
  variant?: 'body' | 'tableCell';
  value: string;
  isEditing?: boolean;
}

const dateFieldStyles = cva(
  'w-full placeholder:text-grey-02 focus:outline-none tabular-nums transition-colors duration-75 ease-in-out text-center',
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

const labelStyles = cva('text-footnote transition-colors duration-75 ease-in-out', {
  variants: {
    active: {
      true: 'text-text',
      false: 'text-grey-02',
    },
    error: {
      true: 'text-red-01',
    },
  },
  defaultVariants: {
    active: false,
    error: false,
  },
});

const timeStyles = cva('w-[21px] placeholder:text-grey-02 focus:outline-none tabular-nums', {
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

export function DateField(props: DateFieldProps) {
  const {
    day: initialDay,
    month: initialMonth,
    year: initialYear,
    hour: initialHour,
    minute: initialMinute,
  } = GeoDate.fromISOStringUTC(props.value);

  const [day, setDay] = useFieldWithValidation(initialDay.padStart(2, '0'), {
    validate: (v: string) => {
      const regex = /^[0-9]*$/;

      if (v !== '') {
        if (!regex.test(v)) throw new Error('Day must be a number');
        if (v.length > 2) throw new Error("Day can't be longer than 2 characters");
        if (Number(v) > 31) throw new Error('Day must be less than 31');
        if (Number(v) < 1) throw new Error('Day must be greater than 0');
      }

      return true;
    },
  });

  const [month, setMonth] = useFieldWithValidation(initialMonth.padStart(2, '0'), {
    validate: (v: string) => {
      const regex = /^[0-9]*$/;

      if (v !== '') {
        if (!regex.test(v)) throw new Error('Month must be a number');
        if (v.length > 2) throw new Error("Month can't be longer than 2 characters");
        if (Number(v) > 12) throw new Error('Month must be 12 or less');
        if (Number(v) < 1) throw new Error('Month must be greater than 0');
      }

      return true;
    },
  });

  const [year, setYear] = useFieldWithValidation(initialYear.padStart(4, '0'), {
    validate: (v: string) => {
      const regex = /^[0-9]*$/;

      if (v !== '') {
        if (!regex.test(v)) throw new Error('Year must be a number');
        if (v.length < 4) throw new Error('Year must be 4 characters');
      }

      return true;
    },
  });

  const [hour, setHour] = useFieldWithValidation(initialHour.padStart(2, '0'), {
    validate: (v: string) => {
      const regex = /^[0-9]*$/;

      if (v !== '') {
        if (!regex.test(v)) throw new Error('Hour must be a number');
        if (Number(v) > 12) throw new Error('Hour must be 12 or less');
        if (Number(v) < 1) throw new Error('Hour must be greater than 0');
      }

      return true;
    },
  });

  const [minute, setMinute] = useFieldWithValidation(initialMinute.padStart(2, '0'), {
    validate: (v: string) => {
      const regex = /^[0-9]*$/;

      if (v !== '') {
        if (!regex.test(v)) throw new Error('Minute must be a number');
        if (Number(v) > 59) throw new Error('Minute must be 59 or less');
        if (Number(v) < 0) throw new Error('Minute must be 0 or greater');
      }

      return true;
    },
  });

  const [dateFormState] = useFormWithValidation({ day: day.value, month: month.value, year: year.value }, values => {
    if (values.month !== '') {
      const dayAsNumber = Number(values.day);
      const yearAsNumber = Number(values.year);

      if (dayAsNumber > 30 && GeoDate.isMonth30Days(Number(values.month))) {
        throw new Error('Day must be less than 31 for the entered month');
      }

      // Check leap year in order to validate February has 29 days
      if (GeoDate.isLeapYear(yearAsNumber)) {
        if (dayAsNumber > 29 && Number(values.month) === 2) {
          throw new Error('Day must be less than 30 for the entered month');
        }
      } else {
        // Otherwise we validate that February has 28 days
        if (dayAsNumber > 28 && Number(values.month) === 2) {
          throw new Error('Day must be less than 29 for the entered month');
        }
      }
    }

    return true;
  });

  const [timeFormState] = useFormWithValidation({ hour: hour.value, minute: minute.value }, values => {
    if (values.hour !== '') {
      if (values.minute === '') {
        throw new Error("Must enter a minute if you've entered an hour");
      }
    }

    if (values.minute !== '') {
      if (values.hour === '') {
        throw new Error("Must enter an hour if you've entered a minute");
      }
    }

    return true;
  });

  const [meridiem, setMeridiem] = React.useState<'am' | 'pm'>(Number(initialHour) < 12 ? 'am' : 'pm');

  const onToggleMeridiem = () => {
    const newMeridiem = meridiem === 'am' ? 'pm' : 'am';
    onBlur(newMeridiem);
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

  const onBlur = (meridiem: 'am' | 'pm') => {
    try {
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

      if (Number(day.value) < 10) {
        newDay = day.value.padStart(2, '0');
        setDay(newDay);
      }

      if (Number(month.value) < 10) {
        newMonth = month.value.padStart(2, '0');
        setMonth(newMonth);
      }

      if (Number(year.value) < 1000 || Number(year.value) < 100 || Number(year.value) < 10) {
        newYear = year.value.padStart(4, '0');
        setYear(newYear);
      }

      if (Number(hour.value) === 12) {
        newHour = '00';
      }

      const isValidMinute = minute.value === '' || (!minute.isValidating && minute.isValid);
      const isValidMonth = month.value === '' || (!month.isValidating && month.isValid) || !dateFormState.isValid;
      const isValidYear = year.value === '' || (!year.isValidating && year.isValid);
      const isValid = isValidMinute && isValidMonth && isValidYear && dateFormState.isValid && timeFormState.isValid;

      if (isValid) {
        // GeoDate.toISOStringUTC will throw an error if the date is invalid
        const isoString = GeoDate.toISOStringUTC({
          day: newDay,
          month: newMonth,
          year: newYear,
          minute: newMinute,
          hour: meridiem === 'am' ? newHour : (Number(newHour) + 12).toString(),
        });

        // Only create the triple if the form is valid
        props.onBlur?.(isoString);
      }
    } catch (e) {
      console.log(e);
    }
  };

  const isValidDay = day.value === '' || (!day.isValidating && day.isValid);
  const isValidHour = hour.value === '' || (!hour.isValidating && hour.isValid);
  const isValidMinute = minute.value === '' || (!minute.isValidating && minute.isValid);
  const isValidMonth = month.value === '' || (!month.isValidating && month.isValid) || !dateFormState.isValid;
  const isValidYear = year.value === '' || (!year.isValidating && year.isValid);

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div className="flex max-w-[164px] gap-3">
          <div className="flex w-full flex-col" style={{ flex: 2 }}>
            {props.isEditing ? (
              <input
                data-testid="date-field-month"
                value={month.value}
                onChange={onMonthChange}
                onBlur={() => onBlur(meridiem)}
                placeholder="MM"
                className={dateFieldStyles({
                  variant: props.variant,
                  error: !isValidMonth || !dateFormState.isValid,
                })}
              />
            ) : (
              <p
                className={dateFieldStyles({ variant: props.variant, error: !isValidMonth || !dateFormState.isValid })}
              >
                {month.value}
              </p>
            )}
            <span
              className={labelStyles({ active: month.value !== '', error: !isValidMonth || !dateFormState.isValid })}
            >
              Month
            </span>
          </div>

          <span style={{ flex: 1 }} className="w-full pt-[3px] text-grey-02">
            /
          </span>

          <div className="flex flex-col items-center" style={{ flex: 2 }}>
            {props.isEditing ? (
              <input
                data-testid="date-field-day"
                value={day.value}
                onChange={onDayChange}
                onBlur={() => onBlur(meridiem)}
                placeholder="DD"
                className={dateFieldStyles({
                  variant: props.variant,
                  error: !isValidDay || !dateFormState.isValid,
                })}
              />
            ) : (
              <p
                className={dateFieldStyles({
                  variant: props.variant,
                  error: !isValidDay || !dateFormState.isValid,
                })}
              >
                {day.value}
              </p>
            )}
            <span className={labelStyles({ active: day.value !== '', error: !isValidDay || !dateFormState.isValid })}>
              Day
            </span>
          </div>

          <span style={{ flex: 1 }} className="pt-[3px] text-grey-02">
            /
          </span>

          <div className="flex w-full flex-col items-center" style={{ flex: 4 }}>
            {props.isEditing ? (
              <input
                data-testid="date-field-year"
                value={year.value}
                onChange={onYearChange}
                onBlur={() => onBlur(meridiem)}
                placeholder="YYYY"
                className={dateFieldStyles({ variant: props.variant, error: !isValidYear || !dateFormState.isValid })}
              />
            ) : (
              <p className={dateFieldStyles({ variant: props.variant, error: !isValidYear || !dateFormState.isValid })}>
                {year.value}
              </p>
            )}
            <span className={labelStyles({ active: year.value !== '', error: !isValidYear || !dateFormState.isValid })}>
              Year
            </span>
          </div>
        </div>
        <div className="flex items-center">
          <Minus color="grey-03" />
          <Spacer width={18} />
          <div className="flex items-center gap-1">
            {props.isEditing ? (
              <>
                <input
                  data-testid="date-field-hour"
                  value={hour.value === '00' ? '12' : hour.value}
                  onChange={onHourChange}
                  onBlur={() => onBlur(meridiem)}
                  placeholder="00"
                  className={timeStyles({ variant: props.variant, error: !isValidHour || !timeFormState.isValid })}
                />

                <span>:</span>
                <input
                  data-testid="date-field-minute"
                  value={minute.value}
                  onChange={onMinuteChange}
                  onBlur={() => onBlur(meridiem)}
                  placeholder="00"
                  className={timeStyles({ variant: props.variant, error: !isValidMinute || !timeFormState.isValid })}
                />
              </>
            ) : (
              <>
                <p className={timeStyles({ variant: props.variant })}>{hour.value === '00' ? '12' : hour.value}</p>
                <span>:</span>
                <p className={timeStyles({ variant: props.variant })}>{minute.value}</p>
              </>
            )}
          </div>

          {props.isEditing ? (
            <>
              <Spacer width={12} />
              <motion.div whileTap={{ scale: 0.95 }} className="focus:outline-none">
                <SmallButton
                  onClick={() => (props.isEditing ? onToggleMeridiem() : undefined)}
                  variant="secondary"
                  className="uppercase"
                >
                  {meridiem}
                </SmallButton>
              </motion.div>
            </>
          ) : (
            <p className="text-body uppercase">{meridiem}</p>
          )}
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
