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
import { ID } from '~/core/id';
import type { Property } from '~/core/types';

import { CheckboxVisual } from '~/design-system/checkbox';
import { ChevronDownSmall } from '~/design-system/icons/chevron-down-small';
import { Menu } from '~/design-system/menu';

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
  baseFilterState,
  baseModesByColumn,
  selections,
  updateSelections,
  hydrated,
  open,
  onOpenChange,
}: Omit<TableBlockDropdownsProps, 'configs' | 'properties' | 'spaceId'> & {
  config: BlockDropdownConfig;
  property: Property;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const columnId = config.propertyId;
  const label = config.propertyName ?? property.name ?? 'Property';

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
  // the pill reads correctly before (or without) the option fetch.
  const pinned: DropdownOption[] = React.useMemo(() => {
    const byId = new Map<string, DropdownOption>();
    for (const f of defaultFilters) byId.set(f.value, { id: f.value, name: f.valueName });
    for (const id of selected) if (!byId.has(id)) byId.set(id, { id, name: null });
    return [...byId.values()];
  }, [defaultFilters, selected]);

  const { options, nameOf, isLoading } = useDropdownOptions({
    columnId,
    baseFilterState,
    baseModesByColumn,
    pinned,
  });

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

  return (
    <Menu
      asChild
      open={open}
      onOpenChange={onOpenChange}
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
        {options.length === 0 && (
          <p className="px-2 py-2 text-sm text-grey-04">{isLoading ? 'Loading…' : 'No values in this table'}</p>
        )}
        {options.map(option => {
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
      </div>
    </Menu>
  );
}
