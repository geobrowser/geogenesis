'use client';

import * as React from 'react';

import type { FacetOption } from '~/core/bounties/filters';

import { FilterMenu } from '~/design-system/filter-menu';

export type BountyScope = 'featured' | 'all';

export const BOUNTY_SCOPE_OPTIONS: readonly { value: BountyScope; label: string }[] = [
  { value: 'featured', label: 'Featured' },
  { value: 'all', label: 'All' },
];

/**
 * Multi-select facet pill. `options` arrive counted and ordered (see
 * `countFacetOptions`); zero-count options render disabled at the bottom.
 * Selecting nothing means "any", mirroring the "All" row.
 */
export function CheckboxFilter({
  allLabel,
  options,
  selected,
  onChange,
}: {
  allLabel: string;
  options: readonly FacetOption[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  if (options.length === 0) return null;

  const isAny = selected.size === 0 || options.every(option => selected.has(option.key));
  const label = isAny
    ? allLabel
    : [...selected]
        .map(key => options.find(option => option.key === key)?.label ?? key)
        .sort()
        .join(', ');

  const toggle = (key: string) => {
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    // Deselecting the last one means "any" again.
    onChange(next);
  };

  return (
    <FilterMenu
      label={label}
      multiple
      options={options.map(option => ({ ...option, disabled: option.count === 0 }))}
      selectedKeys={selected}
      onToggle={toggle}
      allLabel={allLabel}
      onSelectAll={() => onChange(new Set())}
      emptyMeansAll
      contentClassName="max-w-[260px]"
    />
  );
}

export function ScopeFilter({
  value,
  onChange,
  counts,
}: {
  value: BountyScope;
  onChange: (next: BountyScope) => void;
  /** Result counts per scope, composed with the section's other filters. */
  counts?: Record<BountyScope, number>;
}) {
  return (
    <FilterMenu
      label={BOUNTY_SCOPE_OPTIONS.find(option => option.value === value)?.label ?? ''}
      options={BOUNTY_SCOPE_OPTIONS.map(option => ({
        key: option.value,
        label: option.label,
        count: counts?.[option.value],
      }))}
      selectedKey={value}
      onSelect={onChange}
      contentClassName="max-w-[160px]"
    />
  );
}
