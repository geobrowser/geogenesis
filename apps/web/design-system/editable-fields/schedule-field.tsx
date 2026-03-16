'use client';

import * as React from 'react';

import { formatSchedule, validateSchedule } from '~/core/utils/schedule';

import { Text } from '~/design-system/text';

interface ScheduleFieldProps {
  value: string;
  isEditing?: boolean;
  onChange?: (value: string) => void;
}

export function ScheduleField({ value, isEditing, onChange }: ScheduleFieldProps) {
  const formatted = React.useMemo(() => (value ? formatSchedule(value) : ''), [value]);
  const [localValue, setLocalValue] = React.useState(value);
  const [errors, setErrors] = React.useState<string[]>([]);

  // Sync local value when prop changes externally
  React.useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const handleChange = (newValue: string) => {
    setLocalValue(newValue);
    // Clear errors while typing
    if (errors.length > 0) {
      setErrors([]);
    }
  };

  const handleBlur = () => {
    const trimmed = localValue.trim();
    if (!trimmed) {
      // Allow clearing the field
      setErrors([]);
      onChange?.('');
      return;
    }

    const result = validateSchedule(trimmed);
    if (result.valid) {
      setErrors([]);
      onChange?.(trimmed);
    } else {
      setErrors(result.errors);
    }
  };

  if (!isEditing) {
    return (
      <Text as="p" data-testid="schedule-field-value">
        {formatted}
      </Text>
    );
  }

  const previewFormatted = localValue.trim() ? formatSchedule(localValue) : '';
  const hasErrors = errors.length > 0;

  return (
    <div className="flex flex-col gap-1">
      <textarea
        className={`w-full resize-none rounded border bg-transparent px-2 py-1 text-body text-text placeholder:text-grey-02 focus:outline-hidden ${
          hasErrors ? 'border-red-01' : 'border-grey-02 focus:border-text'
        }`}
        value={localValue}
        rows={3}
        placeholder={`DTSTART:20260101T090000Z\nDTEND:20260101T100000Z\nRRULE:FREQ=WEEKLY;BYDAY=MO`}
        onChange={e => handleChange(e.target.value)}
        onBlur={handleBlur}
        data-testid="schedule-field-input"
      />
      {hasErrors && (
        <div data-testid="schedule-field-errors">
          {errors.map((error, i) => (
            <p key={i} className="text-smallButton text-red-01">
              {error}
            </p>
          ))}
        </div>
      )}
      {!hasErrors && previewFormatted && (
        <span className="text-sm text-grey-04" data-testid="schedule-field-preview">
          {previewFormatted}
        </span>
      )}
    </div>
  );
}
