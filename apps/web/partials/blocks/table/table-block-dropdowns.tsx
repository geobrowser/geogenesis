'use client';

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
import { useInfiniteScrollSentinel } from '~/core/hooks/use-infinite-scroll-sentinel';
import { ID } from '~/core/id';
import { useQueryEntities } from '~/core/sync/use-store';
import type { Property } from '~/core/types';

import { CheckboxVisual } from '~/design-system/checkbox';
import { ChevronDownSmall } from '~/design-system/icons/chevron-down-small';
import { Input } from '~/design-system/input';
import { Menu } from '~/design-system/menu';
import { trapWheelToElement } from '~/design-system/trap-wheel-scroll';

/** Above this many options the menu gets a search bar. */
const SEARCH_BAR_THRESHOLD = 20;
/** Rows revealed per scroll step; the list grows as the sentinel comes into view. */
const REVEAL_STEP = 25;

type TableBlockDropdownsProps = {
  configs: BlockDropdownConfig[];
  /** The overlay's applied set — pills render exactly these columns, nothing else. */
  appliedColumnIds: string[];
  properties: Property[];
  spaceId: string;
  /** The filter state the dropdowns default against (the block's, plus any temporary filters). */
  baseFilterState: Filter[];
  baseModesByColumn: ModesByColumn;
  selections: DropdownSelections;
  updateSelections: (updater: (current: DropdownSelections) => DropdownSelections) => void;
  hydrated: boolean;
  /** COLLECTION blocks: the ordered item ids forming the population; null for query sources. */
  collectionItemIds: string[] | null;
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
  appliedColumnIds,
  properties,
  baseFilterState,
  baseModesByColumn,
  selections,
  updateSelections,
  hydrated,
  collectionItemIds,
}: TableBlockDropdownsProps) {
  const [openColumnId, setOpenColumnId] = React.useState<string | null>(null);

  // Render exactly what the overlay applies (computed in
  // useDropdownQueryOverlay) — never a divergent local property check.
  const relationDropdowns = configs
    .filter(config => appliedColumnIds.some(id => ID.equals(id, config.propertyId)))
    .map(config => ({
      config,
      property: properties.find(p => ID.equals(p.id, config.propertyId)),
    }));

  if (relationDropdowns.length === 0) return null;

  return (
    <>
      {relationDropdowns.map(({ config, property }) => (
        <TableBlockDropdown
          key={config.propertyId}
          config={config}
          property={property}
          baseFilterState={baseFilterState}
          baseModesByColumn={baseModesByColumn}
          selections={selections}
          updateSelections={updateSelections}
          hydrated={hydrated}
          facetColumnIds={appliedColumnIds}
          collectionItemIds={collectionItemIds}
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
  baseFilterState,
  baseModesByColumn,
  selections,
  updateSelections,
  hydrated,
  facetColumnIds,
  collectionItemIds,
  open,
  onOpenChange,
}: Omit<TableBlockDropdownsProps, 'configs' | 'appliedColumnIds' | 'properties' | 'spaceId'> & {
  config: BlockDropdownConfig;
  property: Property | undefined;
  /** The overlay's applied columns — the other facets narrowing this population. */
  facetColumnIds: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const columnId = config.propertyId;
  const label = config.propertyName ?? property?.name ?? 'Property';

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

  // The option list is its own scroll area (below a fixed search bar), so the
  // sentinel observes intersection with it rather than with the viewport.
  const [listEl, setListEl] = React.useState<HTMLDivElement | null>(null);
  const [rawQuery, setRawQuery] = React.useState('');
  const query = useDebouncedValue(rawQuery, 200).trim();
  // Reading past the auto-walk window requires intent: the user scrolled to
  // the end of the loaded list, or is searching.
  const [scrolledToEnd, setScrolledToEnd] = React.useState(false);

  React.useEffect(() => {
    if (!open) {
      setRawQuery('');
      setScrolledToEnd(false);
    }
  }, [open]);

  // The dropdown's one scope: this property's values across the table's
  // population; the first pages load on their own, the rest on demand.
  const { options, nameOf, isWalking, hasMoreInScope, scopeExhausted, isError, retry, scannedCount } =
    useDropdownOptions({
      columnId,
      baseFilterState,
      baseModesByColumn,
      selections,
      facetColumnIds,
      collectionItemIds,
      pinned,
      enabled: open,
      demand: query.length > 0 || scrolledToEnd,
    });

  const visibleOptions = React.useMemo(() => {
    if (!query) return options;
    const needle = query.toLowerCase();
    return options.filter(option => (option.name ?? option.id).toLowerCase().includes(needle));
  }, [options, query]);

  // Infinite scroll reveals the loaded list in steps; loading itself is the
  // hook's walk, so scrolling never triggers network work.
  const [visibleCount, setVisibleCount] = React.useState(REVEAL_STEP);
  React.useEffect(() => {
    setVisibleCount(REVEAL_STEP);
  }, [query, open]);
  const renderedOptions = React.useMemo(() => visibleOptions.slice(0, visibleCount), [visibleOptions, visibleCount]);
  const hasMoreToReveal = visibleCount < visibleOptions.length;
  const revealMore = React.useCallback(() => setVisibleCount(count => count + REVEAL_STEP), []);
  const sentinelRef = useInfiniteScrollSentinel({
    hasNextPage: hasMoreToReveal,
    isFetchingNextPage: false,
    fetchNextPage: revealMore,
    rootMargin: '120px',
    root: listEl,
  });

  // The search bar appears once more than SEARCH_BAR_THRESHOLD values have
  // loaded, or whenever more of the scope remains unread — searching is the
  // way to reach it — and stays for as long as a query is typed.
  const showSearch = query.length > 0 || options.length > SEARCH_BAR_THRESHOLD || hasMoreInScope;

  // A stored override survives reloads as bare ids; resolve their names even
  // while the menu is closed so the pill never reads "…" over a filtered table.
  const unresolvedSelectedIds = React.useMemo(
    () => selected.filter(id => !nameOf(id) && !pinned.some(pin => ID.equals(pin.id, id) && pin.name)),
    [selected, nameOf, pinned]
  );
  const { entities: resolvedEntities } = useQueryEntities({
    where: { id: { in: unresolvedSelectedIds } },
    first: Math.max(unresolvedSelectedIds.length, 1),
    enabled: unresolvedSelectedIds.length > 0,
  });
  const nameFor = React.useCallback(
    (id: string) => nameOf(id) ?? resolvedEntities?.find(entity => ID.equals(entity.id, id))?.name ?? null,
    [nameOf, resolvedEntities]
  );

  const selectedNames = selected.map(id => nameFor(id) ?? '…');
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

  return (
    <Menu
      asChild
      open={open}
      onOpenChange={onOpenChange}
      onCloseAutoFocus={event => event.preventDefault()}
      className="max-w-[280px]"
      // The Menu viewport stops scrolling; the option list below the search
      // bar scrolls instead, so the bar never leaves view.
      viewportClassName="flex w-full max-h-[min(400px,75vh)] min-h-0 min-w-0 flex-col overflow-hidden bg-white [background-clip:padding-box]"
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
      <div className="flex min-h-0 flex-col">
        {showSearch && (
          <div className="shrink-0 px-2 pt-2 pb-2">
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
        <div
          ref={setListEl}
          onScroll={e => {
            const el = e.currentTarget;
            if (el.scrollTop + el.clientHeight >= el.scrollHeight - 200) setScrolledToEnd(true);
          }}
          onWheel={e => {
            // The Menu's own wheel trap would cancel scrolling here because
            // its viewport no longer scrolls; trap against this list instead
            // and keep the event from reaching it.
            trapWheelToElement(listEl, e);
            e.stopPropagation();
          }}
          className={cx(
            'flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-2 pb-2',
            !showSearch && 'pt-2'
          )}
        >
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
              {isError
                ? "Couldn't load values"
                : isWalking
                  ? 'Loading…'
                  : hasMoreInScope
                    ? `No values in the first ${scannedCount.toLocaleString()} rows — scroll or search to check the rest`
                    : query
                      ? 'No matches'
                      : 'No values in this table'}
            </p>
          )}
          {renderedOptions.map(option => {
            const checked = selected.some(id => ID.equals(id, option.id));
            // Counts follow the walk: exact once the scope is exhausted, a
            // lower bound ("N+") while more of it remains, absent for pinned
            // values the walk has not reached. A definite zero is shown but
            // inert (bounty-board facet behavior) — unless checked, so it can
            // still be unselected.
            const count = option.count ?? (scopeExhausted ? 0 : undefined);
            const isInertZero = scopeExhausted && (option.count ?? 0) === 0 && !checked;
            return (
              <button
                key={option.id}
                type="button"
                role="menuitemcheckbox"
                aria-checked={checked}
                disabled={isInertZero}
                onClick={() => toggle(option.id)}
                className={cx(
                  'flex items-center gap-2 rounded px-2 py-2 text-left text-sm text-text hover:bg-grey-01',
                  isInertZero && 'opacity-50 hover:bg-transparent'
                )}
              >
                <CheckboxVisual checked={checked} />
                <span className="min-w-0 truncate">{option.name ?? option.id}</span>
                {count !== undefined && (
                  <span className="ml-auto shrink-0 pl-2 text-footnote text-grey-04">
                    {count.toLocaleString()}
                    {hasMoreInScope ? '+' : ''}
                  </span>
                )}
              </button>
            );
          })}
          {isError && (
            <button
              type="button"
              onClick={() => retry()}
              className="flex items-center rounded px-2 py-2 text-left text-sm text-grey-04 underline hover:bg-grey-01 hover:text-text"
            >
              Retry loading values
            </button>
          )}
          {hasMoreToReveal && <div ref={sentinelRef} className="h-px w-full shrink-0" aria-hidden />}
          {isWalking && renderedOptions.length > 0 && (
            <p className="px-2 pt-1 text-footnote text-grey-04">
              {scannedCount >= 2000 ? `Loading… (${scannedCount.toLocaleString()} rows scanned)` : 'Loading…'}
            </p>
          )}
          {!isWalking && !isError && hasMoreInScope && renderedOptions.length > 0 && (
            <p className="px-2 pt-1 text-footnote text-grey-04">
              {`Scroll or search to load more (${scannedCount.toLocaleString()} rows scanned)`}
            </p>
          )}
        </div>
      </div>
    </Menu>
  );
}
