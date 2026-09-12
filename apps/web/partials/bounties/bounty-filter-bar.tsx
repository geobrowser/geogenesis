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
  space: 'Group by space',
  status: 'Group by status',
  difficulty: 'Group by difficulty',
  skill: 'Group by skill',
  featured: 'Group by featured',
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
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-2 lg:gap-x-1.5 lg:[&_button]:px-2"
      data-testid="bounty-filter-bar"
    >
      {/* Search anchors the left edge, matching the board's left gutter; everything that narrows or
          reorders the board is pushed to the right by `ml-auto`. Search keeps the pill geometry of
          the controls it faces.

          That right-hand arrangement only reads as alignment while the bar fits on one line, which
          it stops doing around 1024px. Under `lg` it is dismantled rather than wrapped: search takes
          its own full-width row, and the two groups below it go `display: contents` so all seven
          pills become items of this one flex container. Nesting them is what stranded a pill — the
          groups are separate flex items, so a leftover filter could never share a row with the sort
          pills no matter how much room was going spare beside it. Flattened, they simply pack, and
          the divider disappears with the box that drew it.

          Packing alone still left the last pill over: measured in Calibre on a 431px phone, the
          second row ran to 237 of 355px and the remaining pill needed 119 — one pixel more than
          the 118 left. So the pills also lose 2px of side padding and the row 2px of gap here,
          which buys ~15px and settles the whole bar into two rows. The narrower padding is scoped
          to descendants of this bar, leaving `FILTER_PILL_CLASS` alone for the surfaces that share
          it; menu contents are portaled out, so only the triggers and Clear filters are touched.

          Note this file's breakpoints are max-width (styles.css): `lg` is ≤1023px. */}
      <label
        className={`${FILTER_PILL_CLASS} w-[220px] cursor-text gap-1.5 focus-within:border-grey-03 hover:bg-white lg:w-full`}
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

      <div className="ml-auto flex flex-wrap items-center justify-end gap-x-3 gap-y-2 lg:contents">
        <div className="flex flex-wrap items-center justify-end gap-2 lg:contents" data-testid="bounty-filters">
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

          {isFiltered ? (
            <button
              type="button"
              onClick={() => onChange({ ...DEFAULT_BOUNTY_FILTERS, sort: filters.sort, groupBy: filters.groupBy })}
              className={FILTER_PILL_CLASS}
            >
              Clear filters
            </button>
          ) : null}
        </div>

        {/* Sorting and grouping are view options, not filters — same row, own group behind the divider. */}
        <div
          className="flex flex-wrap items-center gap-2 border-l border-grey-02 pl-3 lg:contents"
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
    </div>
  );
}

function isDefaultStatuses(statuses: readonly WorkflowStatusKey[]): boolean {
  const def = DEFAULT_BOUNTY_FILTERS.statuses;
  return statuses.length === def.length && statuses.every(key => def.includes(key));
}
