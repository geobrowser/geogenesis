'use client';

import * as React from 'react';

import { AnimatePresence, motion } from 'framer-motion';

import {
  type ParsedSchedule,
  formatSchedule,
  parseSchedule,
  serializeSchedule,
  validateSchedule,
} from '~/core/utils/schedule';

import { SmallButton } from '~/design-system/button';
import { Text } from '~/design-system/text';

interface ScheduleFieldProps {
  value: string;
  isEditing?: boolean;
  onChange?: (value: string) => void;
}

const DAY_OPTIONS = [
  { key: 'MO', label: 'Mon' },
  { key: 'TU', label: 'Tue' },
  { key: 'WE', label: 'Wed' },
  { key: 'TH', label: 'Thu' },
  { key: 'FR', label: 'Fri' },
  { key: 'SA', label: 'Sat' },
  { key: 'SU', label: 'Sun' },
] as const;

const FREQ_OPTIONS = [
  { value: '', label: 'No repeat' },
  { value: 'DAILY', label: 'Daily' },
  { value: 'WEEKLY', label: 'Weekly' },
  { value: 'MONTHLY', label: 'Monthly' },
  { value: 'YEARLY', label: 'Yearly' },
] as const;

const fieldClass =
  'w-full rounded border border-grey-02 bg-transparent px-2 py-1 text-body text-text placeholder:text-grey-02 focus:border-text focus:outline-hidden';

const labelClass = 'text-smallButton text-grey-04';

function ScheduleFormEditor({ parsed, onUpdate }: { parsed: ParsedSchedule; onUpdate: (p: ParsedSchedule) => void }) {
  const toggleDay = (day: string) => {
    const byDay = parsed.byDay.includes(day) ? parsed.byDay.filter(d => d !== day) : [...parsed.byDay, day];
    onUpdate({ ...parsed, byDay });
  };

  return (
    <div className="flex flex-col gap-3" data-testid="schedule-form">
      {/* Start date */}
      <div className="flex flex-col gap-1">
        <label className={labelClass}>Start date</label>
        <input
          type="date"
          className={fieldClass}
          value={parsed.startDate}
          onChange={e => onUpdate({ ...parsed, startDate: e.target.value })}
          data-testid="schedule-start-date"
        />
      </div>

      {/* Time range */}
      <div className="flex items-end gap-2">
        <div className="flex flex-1 flex-col gap-1">
          <label className={labelClass}>Start time (UTC)</label>
          <input
            type="time"
            className={fieldClass}
            value={parsed.startTime}
            onChange={e => onUpdate({ ...parsed, startTime: e.target.value })}
            data-testid="schedule-start-time"
          />
        </div>
        <span className="py-1 text-grey-02">–</span>
        <div className="flex flex-1 flex-col gap-1">
          <label className={labelClass}>End time (UTC)</label>
          <input
            type="time"
            className={fieldClass}
            value={parsed.endTime}
            onChange={e => onUpdate({ ...parsed, endTime: e.target.value })}
            data-testid="schedule-end-time"
          />
        </div>
      </div>

      {/* Frequency */}
      <div className="flex flex-col gap-1">
        <label className={labelClass}>Repeat</label>
        <select
          className={fieldClass}
          value={parsed.freq}
          onChange={e => onUpdate({ ...parsed, freq: e.target.value })}
          data-testid="schedule-freq"
        >
          {FREQ_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Days of week (visible when freq is WEEKLY) */}
      {parsed.freq === 'WEEKLY' && (
        <div className="flex flex-col gap-1">
          <label className={labelClass}>On days</label>
          <div className="flex gap-1" data-testid="schedule-days">
            {DAY_OPTIONS.map(day => (
              <SmallButton
                key={day.key}
                variant={parsed.byDay.includes(day.key) ? 'primary' : 'secondary'}
                onClick={() => toggleDay(day.key)}
                data-testid={`schedule-day-${day.key}`}
              >
                {day.label}
              </SmallButton>
            ))}
          </div>
        </div>
      )}

      {/* Interval (visible when a frequency is selected) */}
      {parsed.freq && (
        <div className="flex flex-col gap-1">
          <label className={labelClass}>Every N intervals</label>
          <input
            type="number"
            min={1}
            className={`${fieldClass} w-20`}
            value={parsed.interval}
            onChange={e => {
              const n = parseInt(e.target.value, 10);
              if (!isNaN(n) && n >= 1) {
                onUpdate({ ...parsed, interval: n });
              }
            }}
            data-testid="schedule-interval"
          />
        </div>
      )}
    </div>
  );
}

export function ScheduleField({ value, isEditing, onChange }: ScheduleFieldProps) {
  const formatted = React.useMemo(() => (value ? formatSchedule(value) : ''), [value]);
  const [parsed, setParsed] = React.useState<ParsedSchedule>(() => parseSchedule(value));
  const [errors, setErrors] = React.useState<string[]>([]);

  // Sync when prop changes externally
  React.useEffect(() => {
    setParsed(parseSchedule(value));
  }, [value]);

  const handleUpdate = React.useCallback(
    (updated: ParsedSchedule) => {
      setParsed(updated);
      setErrors([]);

      const serialized = serializeSchedule(updated);

      // If the user cleared the start date, treat as clearing
      if (!serialized) {
        onChange?.('');
        return;
      }

      const result = validateSchedule(serialized);
      if (result.valid) {
        onChange?.(serialized);
      } else {
        setErrors(result.errors);
      }
    },
    [onChange]
  );

  if (!isEditing) {
    return (
      <Text as="p" data-testid="schedule-field-value">
        {formatted}
      </Text>
    );
  }

  const serialized = serializeSchedule(parsed);
  const previewFormatted = serialized ? formatSchedule(serialized) : '';
  const hasErrors = errors.length > 0;

  return (
    <div className="flex flex-col gap-2">
      <ScheduleFormEditor parsed={parsed} onUpdate={handleUpdate} />

      <AnimatePresence mode="wait">
        {hasErrors && (
          <motion.div
            data-testid="schedule-field-errors"
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.15 }}
          >
            {errors.map((error, i) => (
              <p key={i} className="text-smallButton text-red-01">
                {error}
              </p>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {!hasErrors && previewFormatted && (
        <span className="text-sm text-grey-04" data-testid="schedule-field-preview">
          {previewFormatted}
        </span>
      )}
    </div>
  );
}
