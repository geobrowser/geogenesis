'use client';

import * as React from 'react';

import {
  type RankingFilters,
  type RecordedFilter,
  formatRecorded,
  hasRankingFilters,
  isDayKey,
  recordedBetween,
  recordedLabel,
} from '~/core/blocks/ranking/best-debates-ranking-filters';
import { dayLabel, recentDayKeys } from '~/core/blocks/ranking/best-debates-views';
import { HubFilterMenu, HubMultiFilterMenu, pickerLabel } from '~/core/debates/matchmaking/hub-filter-menu';
import { normId } from '~/core/utils/norm-id';

import type { BestDebatesFilterFacets } from './use-best-debates-filter-facets';
import type { BestDebatesRankingFilterState } from './use-best-debates-ranking-filters';

const ANY = 'any';
const WEEK = 'week';
const CUSTOM = 'custom';

/** The Recorded menu's value for a filter: a strip day, This week, or Custom dates for anything else. */
export function recordedMenuValue(recorded: RecordedFilter | null, todayKey: string): string {
  if (!recorded) return ANY;
  if (recorded.kind === 'week') return WEEK;
  if (recorded.kind === 'day' && recentDayKeys(todayKey).includes(recorded.dayKey)) return recorded.dayKey;
  return CUSTOM;
}

/**
 * The team column's narrowing filters (GEO-3774), on one row under the search field: when the
 * debate was recorded, who debated it and which claim it was on. Topic stays beside the search.
 * Each menu is the Debates panel's own (`HubFilterMenu` / `HubMultiFilterMenu`), with counts over
 * the whole list.
 */
export function BestDebatesFilterRow({
  state,
  facets,
  todayKey,
  topicsPicked,
  onClearTopics,
}: {
  state: BestDebatesRankingFilterState;
  facets: BestDebatesFilterFacets;
  todayKey: string;
  /** Clear filters takes the topics off too. */
  topicsPicked: boolean;
  onClearTopics: () => void;
}) {
  const { filters, setFilters } = state;
  const menuValue = recordedMenuValue(filters.recorded, todayKey);
  const [customOpen, setCustomOpen] = React.useState(menuValue === CUSTOM);
  const showCustom = customOpen || menuValue === CUSTOM;

  const set = (patch: Partial<RankingFilters>, element: Parameters<typeof setFilters>[1]) =>
    setFilters({ ...filters, ...patch }, element);

  const recordedOptions = [
    { value: ANY, label: 'Any time' },
    { value: WEEK, label: 'This week' },
    ...recentDayKeys(todayKey).map(key => ({ value: key, label: dayLabel(key, todayKey) })),
    { value: CUSTOM, label: 'Custom dates…' },
  ];

  const debaterOptions = facets.debaters.map(option => ({
    value: option.id,
    label: option.name ?? 'Debater',
    pending: option.name === null,
    count: option.count,
  }));
  const claimOptions = facets.claims.map(option => ({
    value: option.id,
    label: option.name ?? 'Claim',
    pending: option.name === null,
    count: option.count,
  }));
  const nameOf = (options: { value: string; label: string }[], id: string | null | undefined) =>
    options.find(option => normId(option.value) === normId(id ?? ''))?.label;

  const debaterLabel = pickerLabel(
    filters.debaterIds.length,
    'Debater',
    () => nameOf(debaterOptions, filters.debaterIds[0]) ?? '1 debater',
    count => `${count} debaters`
  );
  const claimLabel = filters.claimId ? (nameOf(claimOptions, filters.claimId) ?? '1 claim') : 'Claim';

  const anyOn = hasRankingFilters(filters) || topicsPicked;

  return (
    <div className="flex flex-col gap-2 pt-2" data-testid="best-debates-filter-row">
      <div className="flex flex-wrap items-center gap-2 md:[scrollbar-width:none] md:flex-nowrap md:overflow-x-auto">
        <HubFilterMenu
          label={filters.recorded ? recordedLabel(filters.recorded, todayKey) : 'Any time'}
          triggerAriaLabel="Recorded"
          options={recordedOptions}
          value={menuValue}
          onChange={value => {
            if (value === CUSTOM) {
              setCustomOpen(true);
              return;
            }
            setCustomOpen(false);
            const recorded: RecordedFilter | null =
              value === ANY ? null : value === WEEK ? { kind: 'week' } : { kind: 'day', dayKey: value };
            set({ recorded }, 'recorded_filter');
          }}
        />
        <HubMultiFilterMenu
          label={debaterLabel}
          options={debaterOptions}
          values={filters.debaterIds}
          onToggle={id => {
            const on = filters.debaterIds.some(picked => normId(picked) === normId(id));
            set(
              {
                debaterIds: on
                  ? filters.debaterIds.filter(picked => normId(picked) !== normId(id))
                  : [...filters.debaterIds, normId(id)],
              },
              'debater_filter'
            );
          }}
          onClear={() => set({ debaterIds: [] }, 'debater_filter')}
          clearLabel="Any debater"
          countsPending={facets.pending}
          searchPlaceholder="Search debaters"
          emptyLabel="No debaters on these debates"
        />
        <HubMultiFilterMenu
          label={claimLabel}
          options={claimOptions}
          values={filters.claimId ? [filters.claimId] : []}
          // One claim at a time: picking another replaces it, picking it again takes it off.
          onToggle={id =>
            set(
              { claimId: filters.claimId && normId(filters.claimId) === normId(id) ? null : normId(id) },
              'claim_filter'
            )
          }
          onClear={() => set({ claimId: null }, 'claim_filter')}
          clearLabel="Any claim"
          countsPending={facets.pending}
          searchPlaceholder="Search claims"
          emptyLabel="No claims on these debates"
        />
        {anyOn ? (
          <button
            type="button"
            className="shrink-0 text-metadata whitespace-nowrap text-grey-04 underline hover:text-text"
            data-geo-analytics-label="Best debates clear filters"
            onClick={() => {
              setCustomOpen(false);
              if (hasRankingFilters(filters)) {
                setFilters({ recorded: null, debaterIds: [], claimId: null }, 'clear_filters');
              }
              if (topicsPicked) onClearTopics();
            }}
          >
            Clear filters
          </button>
        ) : null}
      </div>
      {showCustom ? (
        <RecordedRangeInputs
          recorded={filters.recorded}
          todayKey={todayKey}
          onChange={recorded => set({ recorded }, 'recorded_filter')}
        />
      ) : null}
    </div>
  );
}

/** Custom dates: two native date fields, New York days, both included. The same day twice is one day. */
function RecordedRangeInputs({
  recorded,
  todayKey,
  onChange,
}: {
  recorded: RecordedFilter | null;
  todayKey: string;
  onChange: (recorded: RecordedFilter) => void;
}) {
  const current =
    recorded?.kind === 'range'
      ? { from: recorded.fromKey, to: recorded.toKey }
      : recorded?.kind === 'day'
        ? { from: recorded.dayKey, to: recorded.dayKey }
        : { from: '', to: '' };
  // What's typed so far; a filter is written once both ends are real days.
  const [draft, setDraft] = React.useState(current);
  const recordedKey = recorded ? formatRecorded(recorded) : '';
  React.useEffect(() => {
    setDraft(current);
    // Follows the URL when the filter changes from elsewhere (a menu pick, Clear filters).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordedKey]);

  const update = (end: 'from' | 'to', value: string) => {
    const next = { ...draft, [end]: value };
    setDraft(next);
    if (isDayKey(next.from) && isDayKey(next.to)) onChange(recordedBetween(next.from, next.to));
  };

  const inputClass =
    'h-8 rounded border border-grey-02 bg-white px-2 text-metadata text-text outline-hidden focus-visible:border-text';
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Recorded between">
      <input
        type="date"
        aria-label="From"
        value={draft.from}
        max={todayKey}
        onChange={event => update('from', event.target.value)}
        className={inputClass}
      />
      <span className="text-metadata text-grey-04">to</span>
      <input
        type="date"
        aria-label="To"
        value={draft.to}
        max={todayKey}
        onChange={event => update('to', event.target.value)}
        className={inputClass}
      />
    </div>
  );
}
