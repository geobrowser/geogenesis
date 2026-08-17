'use client';

import * as React from 'react';

import cx from 'classnames';

import type { SpaceRow } from '~/core/bounties/fetch-bounties';
import {
  type BountyFilters,
  type BountyGroupBy,
  type BountySort,
  DEFAULT_BOUNTY_FILTERS,
} from '~/core/bounties/filters';
import {
  DIFFICULTIES,
  type DifficultyKey,
  WORKFLOW_STATUSES,
  type WorkflowStatusKey,
  statusLabelForKey,
} from '~/core/bounties/labels';

import { SmallButton } from '~/design-system/button';
import { ChevronDownSmall } from '~/design-system/icons/chevron-down-small';
import { Input } from '~/design-system/input';
import { Menu } from '~/design-system/menu';
import { Text } from '~/design-system/text';

const SORT_LABELS: Record<BountySort, string> = {
  'updated-desc': 'Recently updated',
  'payout-desc': 'Highest payout',
  'payout-asc': 'Lowest payout',
  'deadline-asc': 'Nearest deadline',
};

const GROUP_BY_LABELS: Record<BountyGroupBy, string> = {
  none: 'No grouping',
  difficulty: 'Group by difficulty',
  space: 'Group by space',
};

type Props = {
  filters: BountyFilters;
  onChange: (next: BountyFilters) => void;
  /** Participating spaces, for the space filter. Omit to hide it (space tab). */
  spaces?: readonly SpaceRow[];
  /** Skills present across the loaded bounties, for the skill filter. */
  skills: readonly { id: string; name: string }[];
};

export function BountyFilterBar({ filters, onChange, spaces, skills }: Props) {
  const [query, setQuery] = React.useState(filters.query);
  React.useEffect(() => setQuery(filters.query), [filters.query]);

  // Debounce text search so every keystroke does not rewrite the URL.
  React.useEffect(() => {
    if (query === filters.query) return;
    const handle = window.setTimeout(() => onChange({ ...filters, query }), 250);
    return () => window.clearTimeout(handle);
  }, [query, filters, onChange]);

  const spaceLabel = filters.spaceId
    ? (spaces?.find(space => space.id === filters.spaceId)?.label ?? 'Space')
    : 'All spaces';
  const difficultyLabel = filters.difficulty
    ? DIFFICULTIES.find(d => d.key === filters.difficulty)!.label
    : 'Any difficulty';
  const skillLabel = filters.skillId ? (skills.find(s => s.id === filters.skillId)?.name ?? 'Skill') : 'Any skill';
  const statusLabel = describeStatuses(filters.statuses);

  const isFiltered =
    filters.spaceId !== null ||
    filters.difficulty !== null ||
    filters.skillId !== null ||
    filters.query !== '' ||
    filters.statuses !== DEFAULT_BOUNTY_FILTERS.statuses;

  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="bounty-filter-bar">
      <div className="w-full max-w-[280px]">
        <Input
          withSearchIcon
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder="Search bounties"
          aria-label="Search bounties"
        />
      </div>

      {spaces && spaces.length > 1 ? (
        <FilterMenu
          label={spaceLabel}
          items={[
            { key: 'all', label: 'All spaces', active: filters.spaceId === null },
            ...spaces.map(space => ({ key: space.id, label: space.label, active: filters.spaceId === space.id })),
          ]}
          onSelect={key => onChange({ ...filters, spaceId: key === 'all' ? null : key })}
        />
      ) : null}

      <FilterMenu
        label={statusLabel}
        closeOnSelect={false}
        items={WORKFLOW_STATUSES.map(status => ({
          key: status.key,
          label: status.label,
          active: filters.statuses.includes(status.key),
        }))}
        onSelect={key => onChange({ ...filters, statuses: toggleStatus(filters.statuses, key as WorkflowStatusKey) })}
      />

      <FilterMenu
        label={difficultyLabel}
        items={[
          { key: 'all', label: 'Any difficulty', active: filters.difficulty === null },
          ...DIFFICULTIES.map(d => ({ key: d.key, label: d.label, active: filters.difficulty === d.key })),
        ]}
        onSelect={key => onChange({ ...filters, difficulty: key === 'all' ? null : (key as DifficultyKey) })}
      />

      {skills.length > 0 ? (
        <FilterMenu
          label={skillLabel}
          maxHeightClass="max-h-[20rem] overflow-y-auto"
          items={[
            { key: 'all', label: 'Any skill', active: filters.skillId === null },
            ...skills.map(skill => ({ key: skill.id, label: skill.name, active: filters.skillId === skill.id })),
          ]}
          onSelect={key => onChange({ ...filters, skillId: key === 'all' ? null : key })}
        />
      ) : null}

      <FilterMenu
        label={SORT_LABELS[filters.sort]}
        items={(Object.keys(SORT_LABELS) as BountySort[]).map(sort => ({
          key: sort,
          label: SORT_LABELS[sort],
          active: filters.sort === sort,
        }))}
        onSelect={key => onChange({ ...filters, sort: key as BountySort })}
      />

      <FilterMenu
        label={GROUP_BY_LABELS[filters.groupBy]}
        items={(Object.keys(GROUP_BY_LABELS) as BountyGroupBy[]).map(groupBy => ({
          key: groupBy,
          label: GROUP_BY_LABELS[groupBy],
          active: filters.groupBy === groupBy,
        }))}
        onSelect={key => onChange({ ...filters, groupBy: key as BountyGroupBy })}
      />

      {isFiltered ? (
        <button
          type="button"
          onClick={() => onChange({ ...DEFAULT_BOUNTY_FILTERS, sort: filters.sort, groupBy: filters.groupBy })}
          className="text-metadata text-grey-04 hover:text-text"
        >
          Clear filters
        </button>
      ) : null}
    </div>
  );
}

function toggleStatus(current: readonly WorkflowStatusKey[], key: WorkflowStatusKey): WorkflowStatusKey[] {
  const next = current.includes(key) ? current.filter(k => k !== key) : [...current, key];
  // Never allow an empty set (it would show nothing); fall back to the toggled key alone.
  return next.length === 0 ? [key] : next;
}

function describeStatuses(statuses: readonly WorkflowStatusKey[]): string {
  if (statuses === DEFAULT_BOUNTY_FILTERS.statuses || sameSet(statuses, DEFAULT_BOUNTY_FILTERS.statuses)) return 'Open';
  if (statuses.length === WORKFLOW_STATUSES.length) return 'All statuses';
  if (statuses.length === 1) return statusLabelForKey(statuses[0]);
  return `${statuses.length} statuses`;
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every(x => b.includes(x));
}

function FilterMenu({
  label,
  items,
  onSelect,
  closeOnSelect = true,
  maxHeightClass,
}: {
  label: string;
  items: { key: string; label: string; active: boolean }[];
  onSelect: (key: string) => void;
  closeOnSelect?: boolean;
  maxHeightClass?: string;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <Menu
      open={open}
      onOpenChange={setOpen}
      asChild
      viewportClassName={cx(
        'min-h-0 w-full min-w-0 overflow-y-auto overscroll-contain bg-white [background-clip:padding-box]',
        maxHeightClass ?? 'max-h-[240px]'
      )}
      trigger={<SmallButton icon={<ChevronDownSmall />}>{label}</SmallButton>}
    >
      <>
        {items.map(item => (
          <button
            key={item.key}
            type="button"
            role="menuitemcheckbox"
            aria-checked={item.active}
            onClick={() => {
              onSelect(item.key);
              if (closeOnSelect) setOpen(false);
            }}
            className={cx(
              'flex w-full cursor-pointer items-center gap-2 bg-white px-3 py-2.5 text-left hover:bg-bg',
              item.active && 'bg-grey-01'
            )}
          >
            <Text variant="button" className="hover:text-text!">
              {item.label}
            </Text>
          </button>
        ))}
      </>
    </Menu>
  );
}
