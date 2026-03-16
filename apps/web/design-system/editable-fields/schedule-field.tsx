'use client';

import * as React from 'react';

import { formatSchedule } from '~/core/utils/schedule';

import { Text } from '~/design-system/text';

interface ScheduleFieldProps {
  value: string;
  isEditing?: boolean;
  onChange?: (value: string) => void;
}

export function ScheduleField({ value, isEditing, onChange }: ScheduleFieldProps) {
  const formatted = React.useMemo(() => (value ? formatSchedule(value) : ''), [value]);

  if (!isEditing) {
    return (
      <Text as="p" data-testid="schedule-field-value">
        {formatted}
      </Text>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <textarea
        className="w-full resize-none rounded border border-grey-02 bg-transparent px-2 py-1 text-body text-text placeholder:text-grey-02 focus:border-text focus:outline-hidden"
        value={value}
        rows={3}
        placeholder="DTSTART:20260101T090000Z&#10;DTEND:20260101T100000Z&#10;RRULE:FREQ=WEEKLY;BYDAY=MO"
        onChange={e => onChange?.(e.target.value)}
      />
      {value && <span className="text-sm text-grey-04">{formatted}</span>}
    </div>
  );
}
