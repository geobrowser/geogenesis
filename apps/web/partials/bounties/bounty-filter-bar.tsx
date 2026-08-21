'use client';

import * as React from 'react';

import type { SpaceRow } from '~/core/bounties/fetch-bounties';
import {
  type BountyFilters,
  type BountyGroupBy,
  type BountySort,
  DEFAULT_BOUNTY_FILTERS,
  bountyFacetCounts,
} from '~/core/bounties/filters';
import {
  DIFFICULTIES,
  type DifficultyKey,
  WORKFLOW_STATUSES,
  type WorkflowStatusKey,
  statusLabelForKey,
} from '~/core/bounties/labels';
import type { BoardBounty } from '~/core/bounties/types';

import { FILTER_PILL_CLASS, FilterMenu } from '~/design-system/filter-menu';
import { Search } from '~/design-system/icons/search';

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
  /** Everything loaded for this board — facet counts are computed against it. */
  bounties: readonly BoardBounty[];
  /** Participating spaces, for the space filter. Omit to hide it (space tab). */
  spaces?: readonly SpaceRow[];
  /** Skills present across the loaded bounties, for the skill filter. */
  skills: readonly { id: string; name: string }[];
};

/** Summarizes a multi-select facet for its trigger: "Any X" / one label / "N X". */
function summarize(
  selected: readonly string[],
  labelFor: (key: string) => string,
  any: string,
  plural: string
): string {
  if (selected.length === 0) return any;
  if (selected.length === 1) return labelFor(selected[0]);
  return `${selected.length} ${plural}`;
}

function toggle<K extends string>(current: readonly K[], key: K): K[] {
  return current.includes(key) ? current.filter(k => k !== key) : [...current, key];
}

export function BountyFilterBar({ filters, onChange, bounties, spaces, skills }: Props) {
  const [query, setQuery] = React.useState(filters.query);
  React.useEffect(() => setQuery(filters.query), [filters.query]);

  // Debounce text search so every keystroke does not rewrite the URL.
  React.useEffect(() => {
    if (query === filters.query) return;
    const handle = window.setTimeout(() => onChange({ ...filters, query }), 250);
    return () => window.clearTimeout(handle);
  }, [query, filters, onChange]);

  const spaceUniverse = React.useMemo(
    () => spaces?.map(space => ({ id: space.id, label: space.label })) ?? [],
    [spaces]
  );
  const statusOptions = React.useMemo(() => bountyFacetCounts(bounties, filters, 'status'), [bounties, filters]);
  const difficultyOptions = React.useMemo(
    () => bountyFacetCounts(bounties, filters, 'difficulty'),
    [bounties, filters]
  );
  const skillOptions = React.useMemo(
    () => bountyFacetCounts(bounties, filters, 'skill', { skills }),
    [bounties, filters, skills]
  );
  const spaceOptions = React.useMemo(
    () => bountyFacetCounts(bounties, filters, 'space', { spaces: spaceUniverse }),
    [bounties, filters, spaceUniverse]
  );
  const withDisabledZeros = <K extends string>(options: { key: K; label: string; count: number }[]) =>
    options.map(option => ({ ...option, disabled: option.count === 0 }));

  const skillName = (id: string) => skills.find(skill => skill.id === id)?.name ?? 'Skill';
  const statusLabel = isDefaultStatuses(filters.statuses)
    ? 'Open'
    : filters.statuses.length === WORKFLOW_STATUSES.length
      ? 'All statuses'
      : summarize(filters.statuses, key => statusLabelForKey(key as WorkflowStatusKey), 'Open', 'statuses');
  const difficultyLabel = summarize(
    filters.difficulties,
    key => DIFFICULTIES.find(d => d.key === key)?.label ?? key,
    'Any difficulty',
    'difficulties'
  );
  const skillLabel = summarize(filters.skillIds, skillName, 'Any skill', 'skills');
  const spaceLabel = summarize(
    filters.spaceIds,
    id => spaces?.find(space => space.id === id)?.label ?? 'Space',
    'All spaces',
    'spaces'
  );

  const isFiltered =
    filters.spaceIds.length > 0 ||
    filters.featuredOnly ||
    filters.difficulties.length > 0 ||
    filters.skillIds.length > 0 ||
    filters.query !== '' ||
    !isDefaultStatuses(filters.statuses);

  return (
    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2" data-testid="bounty-filter-bar">
      {/* The text search is a filter like the dropdowns: same group, same pill geometry. */}
      <div className="flex flex-wrap items-center gap-2" data-testid="bounty-filters">
        <label
          className={`${FILTER_PILL_CLASS} w-[220px] cursor-text gap-1.5 focus-within:border-grey-03 hover:bg-white`}
        >
          <Search />
          <input
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Search bounties"
            aria-label="Search bounties"
            className="min-w-0 flex-1 bg-transparent text-[16px] leading-[20px] outline-none placeholder:text-grey-03"
          />
        </label>
        {spaces && spaces.length > 1 ? (
          <FilterMenu
            label={spaceLabel}
            multiple
            options={withDisabledZeros(spaceOptions)}
            selectedKeys={new Set(filters.spaceIds)}
            onToggle={key => onChange({ ...filters, spaceIds: toggle(filters.spaceIds, key) })}
            allLabel="All spaces"
            onSelectAll={() => onChange({ ...filters, spaceIds: [] })}
            emptyMeansAll
            maxHeightClass="max-h-[400px] overflow-y-auto"
          />
        ) : null}

        <FilterMenu
          label={filters.featuredOnly ? 'Featured' : 'All'}
          multiple
          options={[{ key: 'featured', label: 'Featured', count: bounties.filter(b => b.isFeatured).length }]}
          selectedKeys={new Set(filters.featuredOnly ? ['featured'] : [])}
          onToggle={() => onChange({ ...filters, featuredOnly: !filters.featuredOnly })}
          allLabel="All"
          onSelectAll={() => onChange({ ...filters, featuredOnly: false })}
          emptyMeansAll
        />

        <FilterMenu
          label={statusLabel}
          multiple
          options={withDisabledZeros(statusOptions)}
          selectedKeys={new Set(filters.statuses)}
          onToggle={key => {
            const next = toggle(filters.statuses, key as WorkflowStatusKey);
            // Never allow an empty set (it would show nothing); fall back to the toggled key alone.
            onChange({ ...filters, statuses: next.length === 0 ? [key as WorkflowStatusKey] : next });
          }}
          allLabel="All statuses"
          onSelectAll={() => onChange({ ...filters, statuses: WORKFLOW_STATUSES.map(status => status.key) })}
        />

        <FilterMenu
          label={difficultyLabel}
          multiple
          options={withDisabledZeros(difficultyOptions)}
          selectedKeys={new Set(filters.difficulties)}
          onToggle={key => onChange({ ...filters, difficulties: toggle(filters.difficulties, key as DifficultyKey) })}
          allLabel="Any difficulty"
          onSelectAll={() => onChange({ ...filters, difficulties: [] })}
          emptyMeansAll
        />

        {skills.length > 0 ? (
          <FilterMenu
            label={skillLabel}
            multiple
            options={withDisabledZeros(skillOptions)}
            selectedKeys={new Set(filters.skillIds)}
            onToggle={key => onChange({ ...filters, skillIds: toggle(filters.skillIds, key) })}
            allLabel="Any skill"
            onSelectAll={() => onChange({ ...filters, skillIds: [] })}
            emptyMeansAll
            maxHeightClass="max-h-[400px] overflow-y-auto"
          />
        ) : null}

        {/* Always in the layout so the centered bar keeps one width; just invisible when idle. */}
        <button
          type="button"
          onClick={() => onChange({ ...DEFAULT_BOUNTY_FILTERS, sort: filters.sort, groupBy: filters.groupBy })}
          className={`${FILTER_PILL_CLASS} ${isFiltered ? '' : 'invisible'}`}
          aria-hidden={!isFiltered}
          tabIndex={isFiltered ? 0 : -1}
        >
          Clear filters
        </button>
      </div>

      {/* Sorting and grouping are view options, not filters — same row, own group behind the divider. */}
      <div
        className="flex flex-wrap items-center gap-2 border-l border-grey-02 pl-3"
        data-testid="bounty-view-options"
        aria-label="Sort and group"
      >
        <FilterMenu
          label={SORT_LABELS[filters.sort]}
          options={(Object.keys(SORT_LABELS) as BountySort[]).map(sort => ({ key: sort, label: SORT_LABELS[sort] }))}
          selectedKey={filters.sort}
          onSelect={key => onChange({ ...filters, sort: key as BountySort })}
        />

        <FilterMenu
          label={GROUP_BY_LABELS[filters.groupBy]}
          options={(Object.keys(GROUP_BY_LABELS) as BountyGroupBy[]).map(groupBy => ({
            key: groupBy,
            label: GROUP_BY_LABELS[groupBy],
          }))}
          selectedKey={filters.groupBy}
          onSelect={key => onChange({ ...filters, groupBy: key as BountyGroupBy })}
        />
      </div>
    </div>
  );
}

function isDefaultStatuses(statuses: readonly WorkflowStatusKey[]): boolean {
  const def = DEFAULT_BOUNTY_FILTERS.statuses;
  return statuses.length === def.length && statuses.every(key => def.includes(key));
}
