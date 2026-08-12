'use client';

import * as React from 'react';

import { CheckboxVisual } from '~/design-system/checkbox';
import { Menu } from '~/design-system/menu';

import { FilterPillTrigger, SingleSelectPill } from './community-filter-pill';

export type BountyScope = 'featured' | 'all';

export const BOUNTY_SCOPE_OPTIONS: readonly { value: BountyScope; label: string }[] = [
  { value: 'featured', label: 'Featured' },
  { value: 'all', label: 'All' },
];

export function CheckboxFilter({
  allLabel,
  options,
  selected,
  onChange,
}: {
  allLabel: string;
  options: string[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const [open, setOpen] = React.useState(false);

  const isAny = selected.size === 0 || options.every(option => selected.has(option));
  const label = isAny ? allLabel : [...selected].join(', ');

  const toggle = (option: string) => {
    const next = new Set(selected);
    if (next.has(option)) {
      next.delete(option);
    } else {
      next.add(option);
    }
    onChange(next.size === 0 ? new Set(options) : next);
  };

  if (options.length === 0) return null;

  return (
    <Menu
      asChild
      open={open}
      onOpenChange={setOpen}
      className="max-w-[240px]"
      trigger={<FilterPillTrigger label={label} className="max-w-[220px]" />}
    >
      <div className="flex flex-col p-2">
        <button
          type="button"
          onClick={() => onChange(new Set(options))}
          className="flex items-center gap-2 rounded px-2 py-2 text-left text-[16px] leading-[20px] text-[#2A2B2E] hover:bg-grey-01"
        >
          <CheckboxVisual checked={isAny} />
          <span className="min-w-0 truncate">{allLabel}</span>
        </button>
        <div className="my-1 h-px shrink-0 bg-divider" aria-hidden />
        {options.map(option => (
          <button
            key={option}
            type="button"
            onClick={() => toggle(option)}
            className="flex items-center gap-2 rounded px-2 py-2 text-left text-[16px] leading-[20px] text-[#2A2B2E] hover:bg-grey-01"
          >
            <CheckboxVisual checked={selected.has(option)} />
            <span className="min-w-0 truncate">{option}</span>
          </button>
        ))}
      </div>
    </Menu>
  );
}

export function ScopeFilter({ value, onChange }: { value: BountyScope; onChange: (next: BountyScope) => void }) {
  return (
    <SingleSelectPill
      value={value}
      options={BOUNTY_SCOPE_OPTIONS}
      onChange={onChange}
      contentClassName="max-w-[160px]"
    />
  );
}
