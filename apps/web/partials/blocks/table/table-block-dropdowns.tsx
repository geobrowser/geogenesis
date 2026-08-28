'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import cx from 'classnames';

import type { Filter, ModesByColumn } from '~/core/blocks/data/filters';
import {
  DropdownSelections,
  effectiveDropdownSelection,
  filterDefaultsForColumn,
  toggleDropdownSelection,
} from '~/core/blocks/data/table-dropdown-selections';
import type { BlockDropdownConfig } from '~/core/blocks/data/use-block-dropdowns';
import type { DropdownOption } from '~/core/blocks/data/use-dropdown-options';
import { useDropdownOptions } from '~/core/blocks/data/use-dropdown-options';
import { useDebouncedValue } from '~/core/hooks/use-debounced-value';
import { useGlobalSearchSpaceIds } from '~/core/hooks/use-global-search-space-ids';
import { useRelationTargetTypeIds } from '~/core/hooks/use-relation-target-type-ids';
import { ID } from '~/core/id';
import { E } from '~/core/sync/orm';
import { useSyncEngine } from '~/core/sync/use-sync-engine';
import type { Property } from '~/core/types';

import { CheckboxVisual } from '~/design-system/checkbox';
import { ChevronDownSmall } from '~/design-system/icons/chevron-down-small';
import { Input } from '~/design-system/input';
import { Menu } from '~/design-system/menu';

/** Above this many options the menu gets a search bar. */
const SEARCH_BAR_THRESHOLD = 20;
/** Page of globally ranked matches per search, as in the filter value input. */
const SEARCH_PAGE_SIZE = 25;

type TableBlockDropdownsProps = {
  configs: BlockDropdownConfig[];
  properties: Property[];
  spaceId: string;
  /** The filter state the dropdowns default against (the block's, plus any temporary filters). */
  baseFilterState: Filter[];
  baseModesByColumn: ModesByColumn;
  selections: DropdownSelections;
  updateSelections: (updater: (current: DropdownSelections) => DropdownSelections) => void;
  hydrated: boolean;
};

/**
 * Browse-mode personal dropdowns for a data block: one checkbox menu per
 * property listed in the block's `Dropdowns` config. Every toggle applies
 * immediately (no Done button); selections are a per-user view and never
 * edit the block's filters. Only relation properties are offered — other
 * property types listed in the config are skipped (out of scope). At most
 * one menu is open at a time.
 */
export function TableBlockDropdowns({
  configs,
  properties,
  spaceId,
  baseFilterState,
  baseModesByColumn,
  selections,
  updateSelections,
  hydrated,
}: TableBlockDropdownsProps) {
  const [openColumnId, setOpenColumnId] = React.useState<string | null>(null);

  const relationDropdowns = configs
    .map(config => ({
      config,
      property: properties.find(p => ID.equals(p.id, config.propertyId)),
    }))
    .filter(({ property }) => property?.dataType === 'RELATION');

  if (relationDropdowns.length === 0) return null;

  return (
    <>
      {relationDropdowns.map(({ config, property }) => (
        <TableBlockDropdown
          key={config.propertyId}
          config={config}
          property={property!}
          spaceId={spaceId}
          baseFilterState={baseFilterState}
          baseModesByColumn={baseModesByColumn}
          selections={selections}
          updateSelections={updateSelections}
          hydrated={hydrated}
          open={openColumnId === config.propertyId}
          onOpenChange={open =>
            setOpenColumnId(current => (open ? config.propertyId : current === config.propertyId ? null : current))
          }
        />
      ))}
    </>
  );
}

function TableBlockDropdown({
  config,
  property,
  spaceId,
  baseFilterState,
  baseModesByColumn,
  selections,
  updateSelections,
  hydrated,
  open,
  onOpenChange,
}: Omit<TableBlockDropdownsProps, 'configs' | 'properties'> & {
  config: BlockDropdownConfig;
  property: Property;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const columnId = config.propertyId;
  const label = config.propertyName ?? property.name ?? 'Property';
  const { store } = useSyncEngine();
  const cache = useQueryClient();
  const additionalSpaceIds = useGlobalSearchSpaceIds();

  const defaultFilters = React.useMemo(
    () => baseFilterState.filter(f => ID.equals(f.columnId, columnId) && !f.isBacklink),
    [baseFilterState, columnId]
  );
  const filterDefaults = React.useMemo(
    () => filterDefaultsForColumn(baseFilterState, columnId),
    [baseFilterState, columnId]
  );
  const selected = effectiveDropdownSelection(selections, columnId, filterDefaults);
  const isOverridden = selections[columnId] !== undefined;

  // Names for the preset values come straight from the resolved filters, so
  // the pill reads correctly before (or without) any fetch.
  const pinned: DropdownOption[] = React.useMemo(() => {
    const byId = new Map<string, DropdownOption>();
    for (const f of defaultFilters) byId.set(f.value, { id: f.value, name: f.valueName });
    for (const id of selected) if (!byId.has(id)) byId.set(id, { id, name: null });
    return [...byId.values()];
  }, [defaultFilters, selected]);

  // Values that occur in this table for the property.
  const { options: tableOptions, isLoading: isTableOptionsLoading } = useDropdownOptions({
    columnId,
    baseFilterState,
    baseModesByColumn,
    pinned,
  });

  // The property's full value universe, as the filter value input resolves
  // it: entities of the relation's target types via the global search
  // endpoint (empty query = top-ranked of that type). Without known target
  // types the universe is open, so only a typed query searches.
  const { typeIds, waitForFilterTypes } = useRelationTargetTypeIds({
    propertyId: columnId,
    spaceId,
    relationValueTypes: property.relationValueTypes,
  });
  const hasTargetTypes = Boolean(typeIds?.length);

  const [rawQuery, setRawQuery] = React.useState('');
  const query = useDebouncedValue(rawQuery, 200).trim();
  const typeIdsKey = typeIds?.slice().sort().join(',') ?? '';

  const { data: searchOptions = [], isFetching: isSearching } = useQuery({
    queryKey: ['data-block', 'dropdown-search', columnId, query, typeIdsKey, additionalSpaceIds],
    enabled: open && !waitForFilterTypes && (hasTargetTypes || query.length > 0),
    queryFn: async ({ signal }) => {
      const results = await E.findFuzzyPage({
        store,
        cache,
        where: {
          name: { fuzzy: query },
          ...(typeIds?.length ? { types: typeIds.map(id => ({ id: { equals: id } })) } : {}),
        },
        first: SEARCH_PAGE_SIZE,
        skip: 0,
        signal,
        additionalSpaceIds,
      });
      return results.results.map((r): DropdownOption => ({ id: r.id, name: r.name }));
    },
    staleTime: 60_000,
  });

  React.useEffect(() => {
    if (!open) setRawQuery('');
  }, [open]);

  const allOptions = React.useMemo(() => {
    const byId = new Map<string, DropdownOption>();
    const add = (option: DropdownOption) => {
      const existing = byId.get(option.id);
      if (!existing || (!existing.name && option.name)) byId.set(option.id, option);
    };
    pinned.forEach(add);
    tableOptions.forEach(add);
    searchOptions.forEach(add);
    return [...byId.values()].sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
  }, [pinned, tableOptions, searchOptions]);

  const visibleOptions = React.useMemo(() => {
    if (!query) return allOptions;
    const needle = query.toLowerCase();
    return allOptions.filter(option => (option.name ?? option.id).toLowerCase().includes(needle));
  }, [allOptions, query]);

  // Search when the list is long, or when the value universe is open-ended
  // (no target types) — then typing is the only way to reach a value that
  // isn't already in the table.
  const showSearch = allOptions.length > SEARCH_BAR_THRESHOLD || !hasTargetTypes || query.length > 0;

  const nameOf = React.useCallback(
    (id: string) => allOptions.find(option => ID.equals(option.id, id))?.name ?? null,
    [allOptions]
  );

  const selectedNames = selected.map(id => nameOf(id) ?? '…');
  const pillLabel =
    selected.length === 0
      ? label
      : selected.length <= 2
        ? `${label}: ${selectedNames.join(', ')}`
        : `${label}: ${selectedNames[0]} +${selected.length - 1}`;

  const toggle = (optionId: string) => {
    updateSelections(current => toggleDropdownSelection(current, columnId, optionId, filterDefaults));
  };

  const reset = () => {
    updateSelections(current => {
      const next = { ...current };
      delete next[columnId];
      return next;
    });
  };

  const isLoading = isTableOptionsLoading || isSearching || waitForFilterTypes;

  return (
    <Menu
      asChild
      open={open}
      onOpenChange={onOpenChange}
      onCloseAutoFocus={event => event.preventDefault()}
      className="max-w-[280px]"
      trigger={
        <button
          type="button"
          disabled={!hydrated}
          aria-label={`Filter ${label}`}
          className={cx(
            'inline-flex max-w-[260px] shrink-0 items-center gap-1 rounded-[6px] border bg-white px-2 py-1 text-metadata leading-none text-text transition-colors hover:bg-grey-01 disabled:opacity-60',
            isOverridden ? 'border-text' : 'border-grey-02'
          )}
        >
          <span className="truncate">{pillLabel}</span>
          <span className="shrink-0 text-grey-04">
            <ChevronDownSmall />
          </span>
        </button>
      }
    >
      <div className="flex flex-col p-2">
        {showSearch && (
          <div className="pb-2">
            <Input
              withSearchIcon
              placeholder={`Search ${label.toLowerCase()}...`}
              value={rawQuery}
              onChange={e => setRawQuery(e.target.value)}
              onClick={e => e.stopPropagation()}
              onKeyDown={e => e.stopPropagation()}
            />
          </div>
        )}
        {isOverridden && (
          <>
            <button
              type="button"
              onClick={reset}
              className="flex items-center rounded px-2 py-2 text-left text-sm text-grey-04 hover:bg-grey-01 hover:text-text"
            >
              Reset to table default
            </button>
            <div className="my-1 h-px shrink-0 bg-divider" aria-hidden />
          </>
        )}
        {visibleOptions.length === 0 && (
          <p className="px-2 py-2 text-sm text-grey-04">
            {isLoading ? 'Loading…' : query ? 'No matches' : 'No values in this table'}
          </p>
        )}
        {visibleOptions.map(option => {
          const checked = selected.some(id => ID.equals(id, option.id));
          return (
            <button
              key={option.id}
              type="button"
              role="menuitemcheckbox"
              aria-checked={checked}
              onClick={() => toggle(option.id)}
              className="flex items-center gap-2 rounded px-2 py-2 text-left text-sm text-text hover:bg-grey-01"
            >
              <CheckboxVisual checked={checked} />
              <span className="min-w-0 truncate">{option.name ?? option.id}</span>
            </button>
          );
        })}
        {isSearching && visibleOptions.length > 0 && <p className="px-2 pt-1 text-footnote text-grey-04">Searching…</p>}
      </div>
    </Menu>
  );
}
