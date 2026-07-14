'use client';

import * as React from 'react';

import { ChevronDownSmall } from '~/design-system/icons/chevron-down-small';
import {
  type DebateFormatId,
  debateFormatById,
  debateFormats,
  debateTimingSummary,
  defaultDebateFormatId,
} from './formats';

type DebateFormatSelectorProps = {
  value: DebateFormatId;
  selectedFormatId?: string | null;
  canChoose: boolean;
  disabled?: boolean;
  className?: string;
  name?: string;
  onChange: (formatId: DebateFormatId) => void;
};

export function DebateFormatSelector({
  value,
  selectedFormatId,
  canChoose,
  disabled = false,
  className,
  name = 'debate-format',
  onChange,
}: DebateFormatSelectorProps) {
  const selectedFormat =
    debateFormatById(selectedFormatId) ?? debateFormatById(value) ?? debateFormatById(defaultDebateFormatId);

  return (
    <div className={className}>
      <label htmlFor={name} className="sr-only">
        Debate format
      </label>
      <div className="relative">
        <select
          id={name}
          name={name}
          value={canChoose ? value : selectedFormat?.id}
          disabled={disabled || !canChoose}
          onChange={event => onChange(event.target.value as DebateFormatId)}
          className="min-h-9 w-full appearance-none rounded border border-grey-02 bg-white px-3 py-2 pr-8 text-button text-text outline-hidden hover:border-grey-04 focus:border-text disabled:cursor-not-allowed disabled:bg-bg disabled:text-grey-04"
        >
          {debateFormats.map(format => (
            <option key={format.id} value={format.id}>
              {format.label} · {debateTimingSummary(format)}
              {format.developmentOnly ? ' · Dev' : ''}
            </option>
          ))}
        </select>
        <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2">
          <ChevronDownSmall color="grey-04" />
        </span>
      </div>
    </div>
  );
}
