'use client';

import * as React from 'react';

import { FilterMenu } from '~/design-system/filter-menu';

// The filter pill primitives live in the design system so the bounty board and
// the Community tab share one filter language. Re-exported here for the
// remaining community-tab consumers.
export { FILTER_PILL_CLASS, FilterPillTrigger } from '~/design-system/filter-menu';

/** A single-value pill (e.g. the leaderboard period): `FilterMenu` with value/label options. */
export function SingleSelectPill<TValue extends string>({
  value,
  options,
  onChange,
  triggerClassName,
  contentClassName = 'max-w-[200px]',
}: {
  value: TValue;
  options: readonly { value: TValue; label: string }[];
  onChange: (next: TValue) => void;
  triggerClassName?: string;
  contentClassName?: string;
}) {
  const label = options.find(option => option.value === value)?.label ?? '';
  return (
    <FilterMenu
      label={label}
      options={options.map(option => ({ key: option.value, label: option.label }))}
      selectedKey={value}
      onSelect={onChange}
      triggerClassName={triggerClassName}
      contentClassName={contentClassName}
    />
  );
}
