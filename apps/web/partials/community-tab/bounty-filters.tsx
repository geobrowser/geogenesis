'use client';

import * as React from 'react';

import type { FacetOption } from '~/core/bounties/filters';

import { FilterMenu } from '~/design-system/filter-menu';

export type BountyScope = 'featured' | 'all';

/**
 * All leads, and is the default the tables open on.
 *
 * Featured was first and selected by default, which meant every bounties table opened already
 * filtered — with no sign that it was, beyond a pill reading "Featured" that looks much like a
 * label. A curator's shortlist is a narrower answer than "what work is there", and the second is
 * the question someone lands on this tab with.
 */
export const BOUNTY_SCOPE_OPTIONS: readonly { value: BountyScope; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'featured', label: 'Featured' },
];

/**
 * What the tables open on, read off the list above rather than written out again.
 *
 * The two were separate constants and could disagree — the menu led with Featured while the tables
 * defaulted to it independently, so changing one was not enough. Tying them together makes
 * reordering the options the whole of the change.
 */
export const DEFAULT_BOUNTY_SCOPE: BountyScope = BOUNTY_SCOPE_OPTIONS[0].value;

/**
 * The scope that narrows nothing — what "Show all" on an empty state has to mean.
 *
 * Distinct from {@link DEFAULT_BOUNTY_SCOPE} even though the two name the same value today. One is
 * where the tables open, the other is where an escape hatch has to land, and reordering the options
 * moves only the first. Clearing to the default instead would mean that putting Featured back at
 * the front turned "Show all" into a button that reproduced the empty state it was offered from.
 */
export const UNFILTERED_BOUNTY_SCOPE: BountyScope = 'all';

/** Whether a raw query-string value names one of the scopes above. */
function isBountyScope(value: string | null): value is BountyScope {
  return BOUNTY_SCOPE_OPTIONS.some(option => option.value === value);
}

/**
 * The scope a `?scope=` value names.
 *
 * `all` and `featured` are both real values and are read as themselves — a `?scope=all` link from
 * before All became the default still names All, and keeps working. Only a missing or unrecognised
 * value falls back, rather than being carried around meaning nothing.
 */
export function bountyScopeFromParam(value: string | null): BountyScope {
  return isBountyScope(value) ? value : DEFAULT_BOUNTY_SCOPE;
}

/**
 * Mirrors a scope into `params`, in place.
 *
 * The default is expressed by the param's absence rather than by its value, so an untouched filter
 * leaves no trace in the URL. Paired with {@link bountyScopeFromParam} so the two directions cannot
 * disagree about which value that is.
 */
export function writeBountyScopeParam(params: URLSearchParams, scope: BountyScope): void {
  if (scope === DEFAULT_BOUNTY_SCOPE) params.delete('scope');
  else params.set('scope', scope);
}

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
