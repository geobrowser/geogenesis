import * as React from 'react';
import { cva } from 'class-variance-authority';
import { AnimatePresence, motion } from 'framer-motion';
import { GeoDate } from '~/modules/utils';

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

function useFieldWithValidation(initialValue: string, validate: (value: string) => boolean) {
  const [value, setValue] = React.useState(initialValue);
  const [isValidating, setIsValidating] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const memoizedValidate = React.useCallback(validate, [validate]);

  React.useEffect(() => {
    try {
      setIsValidating(true);
      memoizedValidate(value);
      setError(null);
      setIsValidating(false);
    } catch (e: unknown) {
      setError((e as Error).message);
      setIsValidating(false);
    }
  }, [value, memoizedValidate]);

  return [
    {
      value,
      error,
      isValidating,
      isValid: error === null,
    },
    (v: string) => setValue(v),
  ] as const;
}

export function DateField(props: DateFieldProps) {
  const { day: initialDay, month: initialMonth, year: initialYear } = GeoDate.fromISOStringUTC(props.value);

  const [day, setDay] = useFieldWithValidation(initialDay, (v: string) => {
    const regex = /^[0-9]*$/;

    if (v !== '') {
      if (!regex.test(v)) throw new Error('Day must be a number');
      if (v.length > 2) throw new Error("Day can't be longer than 2 characters");
      if (Number(v) > 31) throw new Error('Day must be less than 31');
      if (Number(v) < 1) throw new Error('Day must be greater than 0');
    }

    return true;
  });

  const [month, setMonth] = useFieldWithValidation(initialMonth, (v: string) => {
    const regex = /^[0-9]*$/;

    if (v !== '') {
      if (!regex.test(v)) throw new Error('Month must be a number');
      if (v.length > 2) throw new Error("Month can't be longer than 2 characters");
      if (Number(v) > 12) throw new Error('Month must be less than 12');
      if (Number(v) < 1) throw new Error('Month must be greater than 0');
    }

    return true;
  });

  const [year, setYear] = useFieldWithValidation(initialYear, (v: string) => {
    const regex = /^[0-9]*$/;

    if (v !== '') {
      if (!regex.test(v)) throw new Error('Year must be a number');
      if (v.length < 4) throw new Error('Year must be 4 characters');
    }

    return true;
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

  const onBlur = () => {
    // We may have an invalid date if the user is still typing
    try {
      const isoString = GeoDate.toISOStringUTC({ day: day.value, month: month.value, year: year.value });
      console.log('onBlur', isoString);

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
      <div className="flex max-w-[164px] gap-3">
        <div className="flex w-full flex-col" style={{ flex: 2 }}>
          {props.isEditing ? (
            <input
              value={month.value}
              onChange={onMonthChange}
              onBlur={onBlur}
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
              onBlur={onBlur}
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
              onBlur={onBlur}
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
