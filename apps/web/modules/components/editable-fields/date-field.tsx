import * as React from 'react';
import { cva } from 'class-variance-authority';
import { AnimatePresence, motion } from 'framer-motion';
import { GeoDate } from '~/modules/utils';
import { Minus } from '~/modules/design-system/icons/minus';
import { Spacer } from '~/modules/design-system/spacer';
import { SmallButton } from '~/modules/design-system/button';

interface DateFieldProps {
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  onBlur?: (date: string) => void;
  variant?: 'body' | 'tableCell';
  value: string;
  isEditing?: boolean;
}

const dateFieldStyles = cva(
  'w-full placeholder:text-grey-02 focus:outline-none tabular-nums transition-colors duration-75 ease-in-out',
  {
    variants: {
      variant: {
        body: 'text-body',
        tableCell: 'text-tableCell',
      },
      centered: {
        true: 'text-center',
      },
      error: {
        true: 'text-red-01',
      },
    },
    defaultVariants: {
      variant: 'body',
      centered: false,
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

function useFormWithValidation<T extends { day: string; month: string; year: string }>(
  values: T,
  validate: (values: T) => boolean
) {
  const [isValidating, setIsValidating] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    try {
      setIsValidating(true);
      validate(values);
      setError(null);
      setIsValidating(false);
    } catch (e: unknown) {
      setError((e as Error).message);
      setIsValidating(false);
    }
  }, [values, validate]);

  return [
    {
      isValid: error === null,
      isValidating,
      error,
    },
  ];
}

function useFieldWithValidation(
  initialValue: string,
  { validate, transform }: { validate: (value: string) => boolean; transform?: (value: string) => string }
) {
  const [value, setValue] = React.useState(initialValue);
  const [isValidating, setIsValidating] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const memoizedValidate = React.useCallback(validate, [validate]);
  const memoizedTransformedValue = React.useMemo(() => {
    if (transform) {
      return transform(value);
    }

    return value;
  }, [transform, value]);

  React.useEffect(() => {
    try {
      setIsValidating(true);
      memoizedValidate(memoizedTransformedValue);
      setError(null);
      setIsValidating(false);
    } catch (e: unknown) {
      setError((e as Error).message);
      setIsValidating(false);
    }
  }, [memoizedTransformedValue, memoizedValidate]);

  return [
    {
      value: memoizedTransformedValue,
      error,
      isValidating,
      isValid: error === null,
    },
    (v: string) => setValue(v),
  ] as const;
}

export function DateField(props: DateFieldProps) {
  const {
    day: initialDay,
    month: initialMonth,
    year: initialYear,
    hour: initialHour,
    minute: initialMinute,
  } = GeoDate.fromISOStringUTC(props.value);

  const [day, setDay] = useFieldWithValidation(initialDay, {
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

  const [month, setMonth] = useFieldWithValidation(initialMonth, {
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

  const [year, setYear] = useFieldWithValidation(initialYear, {
    validate: (v: string) => {
      const regex = /^[0-9]*$/;

      if (v !== '') {
        if (!regex.test(v)) throw new Error('Year must be a number');
        if (v.length < 4) throw new Error('Year must be 4 characters');
      }

      return true;
    },
  });

  const [hour, setHour] = useFieldWithValidation(initialHour, {
    validate: (v: string) => {
      const regex = /^[0-9]*$/;

      if (v !== '') {
        if (!regex.test(v)) throw new Error('Hour must be a number');
        if (Number(v) > 12) throw new Error('Hour must be 12 or less');
        if (Number(v) < 1) throw new Error('Hour must be greater than 0');
      }

      return true;
    },
    transform: (v: string) => {
      if (v === '') return v;

      const hourAsNumber = Number(v);

      if (hourAsNumber > 12) {
        return (hourAsNumber - 12).toString();
      }

      if (hourAsNumber < 1) {
        return '';
      }

      return v;
    },
  });

  const [minute, setMinute] = useFieldWithValidation(initialMinute, {
    validate: (v: string) => {
      const regex = /^[0-9]*$/;

      if (v !== '') {
        if (!regex.test(v)) throw new Error('Minute must be a number');
        if (Number(v) > 12) throw new Error('Minute must be 60 or less');
        if (Number(v) < 1) throw new Error('Minute must be greater than 0');
      }

      return true;
    },
  });

  const [formState] = useFormWithValidation({ day: day.value, month: month.value, year: year.value }, values => {
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

  console.log('number initialHour', Number(initialHour));
  const [meridiem, setMeridiem] = React.useState<'am' | 'pm'>(Number(initialHour) < 12 ? 'am' : 'pm');
  console.log('meridiem', meridiem);

  const onToggleMeridiem = () => {
    const newMeridiem = meridiem === 'am' ? 'pm' : 'am';
    onBlur(meridiem);
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

  const onBlur = (meridiam: 'am' | 'pm') => {
    try {
      const newMeridiem = meridiam === 'am' ? 'pm' : 'am';
      // GeoDate.toISOStringUTC will throw an error if the date is invalid
      const isoString = GeoDate.toISOStringUTC({
        day: day.value,
        month: month.value,
        year: year.value,
        minute: minute.value,
        hour: newMeridiem === 'am' ? hour.value : (Number(hour.value) + 12).toString(),
      });

      console.log('isoString', isoString);

      // Only create the triple if the form is valid
      if (isValidForm) props.onBlur?.(isoString);
    } catch (e) {
      console.log(e);
    }
  };

  const isValidForm = formState.isValid;
  const isValidDay = day.value === '' || (!day.isValidating && day.isValid);
  const isValidMonth = month.value === '' || (!month.isValidating && month.isValid) || !isValidForm;
  const isValidYear = year.value === '' || (!year.isValidating && year.isValid);

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div className="flex max-w-[157px] gap-3">
          <div className="flex w-full flex-col" style={{ flex: 2 }}>
            {props.isEditing ? (
              <input
                value={month.value}
                onChange={onMonthChange}
                onBlur={() => onBlur(meridiem)}
                placeholder="MM"
                className={dateFieldStyles({ variant: props.variant, error: !isValidMonth || !isValidForm })}
              />
            ) : (
              <p className={dateFieldStyles({ variant: props.variant, error: !isValidMonth || !isValidForm })}>
                {month.value}
              </p>
            )}
            <span className={labelStyles({ active: month.value !== '', error: !isValidMonth || !isValidForm })}>
              Month
            </span>
          </div>

          <span style={{ flex: 1 }} className="w-full pt-[3px] text-grey-02">
            /
          </span>

          <div className="flex flex-col items-center" style={{ flex: 2 }}>
            {props.isEditing ? (
              <input
                value={day.value}
                onChange={onDayChange}
                onBlur={() => onBlur(meridiem)}
                placeholder="DD"
                className={dateFieldStyles({
                  variant: props.variant,
                  centered: true,
                  error: !isValidDay || !isValidForm,
                })}
              />
            ) : (
              <p
                className={dateFieldStyles({
                  variant: props.variant,
                  centered: true,
                  error: !isValidDay || !isValidForm,
                })}
              >
                {day.value}
              </p>
            )}
            <span className={labelStyles({ active: day.value !== '', error: !isValidDay || !isValidForm })}>Day</span>
          </div>

          <span style={{ flex: 1 }} className="pt-[3px] text-grey-02">
            /
          </span>

          <div className="flex w-full flex-col items-center" style={{ flex: 4 }}>
            {props.isEditing ? (
              <input
                value={year.value}
                onChange={onYearChange}
                onBlur={() => onBlur(meridiem)}
                placeholder="YYYY"
                className={dateFieldStyles({ variant: props.variant, centered: true, error: !isValidYear })}
              />
            ) : (
              <p className={dateFieldStyles({ variant: props.variant, centered: true, error: !isValidYear })}>
                {year.value}
              </p>
            )}
            <span className={labelStyles({ active: year.value !== '', error: !isValidYear })}>Year</span>
          </div>
        </div>
        <div className="flex w-[151px] items-center">
          <Minus color="grey-03" />
          <Spacer width={18} />
          {props.isEditing ? (
            <div className="flex items-center justify-start gap-1">
              <input
                value={hour.value}
                onChange={onHourChange}
                onBlur={() => onBlur(meridiem)}
                placeholder="00"
                className={timeStyles({ variant: props.variant, error: !isValidYear })}
              />
              <span>:</span>
              <input
                value={minute.value}
                onChange={onMinuteChange}
                onBlur={() => onBlur(meridiem)}
                placeholder="00"
                className={timeStyles({ variant: props.variant, error: !isValidYear })}
              />
            </div>
          ) : (
            <div className="flex items-center justify-start gap-1">
              <p className={timeStyles({ variant: props.variant })}>{hour.value}</p>
              <span>:</span>
              <p className={timeStyles({ variant: props.variant })}>{minute.value}</p>
            </div>
          )}
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
        </div>
      </div>

      <AnimatePresence mode="wait">
        <div className="overflow-hidden">
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
          {!isValidForm && (
            <motion.p
              className="mt-2 text-smallButton text-red-01"
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              transition={{ duration: 0.15, bounce: 0.2 }}
            >
              The entered day is not valid for the entered month
            </motion.p>
          )}
        </div>
      </AnimatePresence>
    </div>
  );
}
