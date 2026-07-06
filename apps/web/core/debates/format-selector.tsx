'use client';

import * as React from 'react';

import cx from 'classnames';

import { Text } from '~/design-system/text';

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

  if (!canChoose) {
    return (
      <div className={className}>
        <Text as="div" variant="metadataMedium" color="grey-04">
          Timing
        </Text>
        <div className="mt-2 inline-flex max-w-full flex-wrap items-center gap-2 rounded-md border border-grey-02 bg-bg px-3 py-2">
          <Text as="span" variant="metadataMedium" color="text">
            {selectedFormat?.label ?? 'Standard'}
          </Text>
          {selectedFormat && (
            <Text as="span" variant="metadata" color="grey-04">
              {debateTimingSummary(selectedFormat)}
            </Text>
          )}
        </div>
      </div>
    );
  }

  return (
    <fieldset className={className} disabled={disabled}>
      <legend className="text-metadataMedium text-grey-04">Timing</legend>
      <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {debateFormats.map(format => {
          const selected = format.id === value;
          return (
            <label
              key={format.id}
              className={cx(
                'block min-w-0 rounded-md border bg-white px-3 py-2 transition-colors',
                disabled ? 'cursor-default opacity-60' : 'cursor-pointer hover:border-text hover:bg-bg',
                selected ? 'border-text shadow-inner shadow-grey-02' : 'border-grey-02'
              )}
            >
              <input
                type="radio"
                name={name}
                value={format.id}
                checked={selected}
                disabled={disabled}
                onChange={() => onChange(format.id)}
                className="sr-only"
              />
              <span className="flex min-w-0 items-center gap-2">
                <Text as="span" variant="metadataMedium" color="text" className="truncate">
                  {format.label}
                </Text>
                {format.developmentOnly && (
                  <span className="rounded border border-grey-02 bg-bg px-1.5 py-0.5 text-[0.6875rem] leading-none text-grey-04">
                    Dev
                  </span>
                )}
              </span>
              <Text as="span" variant="metadata" color="grey-04" className="mt-1 block truncate">
                {debateTimingSummary(format)}
              </Text>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
