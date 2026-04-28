'use client';

import { SystemIds } from '@geoprotocol/geo-sdk/lite';
import * as Dropdown from '@radix-ui/react-dropdown-menu';

import * as React from 'react';

import cx from 'classnames';

import { Property } from '~/core/types';
import { ColumnSortState, SORTABLE_DATA_TYPES } from '~/core/utils/column-sort';

import { ChevronDownSmall } from '~/design-system/icons/chevron-down-small';
import { Close } from '~/design-system/icons/close';
import { SortTable } from '~/design-system/icons/sort-table';
import { MenuItem } from '~/design-system/menu';

type DataBlockSortMenuProps = {
  properties: Property[];
  sortState: ColumnSortState;
  onSort: (next: ColumnSortState) => void;
  readOnly?: boolean;
};

export function DataBlockSortMenu({ properties, sortState, onSort, readOnly = false }: DataBlockSortMenuProps) {
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const [menuStep, setMenuStep] = React.useState<'fields' | 'direction'>('fields');
  const [pendingPropertyId, setPendingPropertyId] = React.useState<string | null>(null);

  const sortableProperties = React.useMemo(
    () => properties.filter(p => SORTABLE_DATA_TYPES.includes(p.dataType)),
    [properties]
  );

  const propertyLabelById = React.useMemo(
    () =>
      new Map(
        sortableProperties.map(property => [
          property.id,
          property.id === SystemIds.NAME_PROPERTY ? 'Name' : (property.name ?? property.id),
        ])
      ),
    [sortableProperties]
  );

  const handleClearSort = () => {
    onSort(null);
    setIsMenuOpen(false);
  };

  const applySort = (direction: 'asc' | 'desc') => {
    if (!pendingPropertyId) return;
    onSort({
      columnId: pendingPropertyId,
      direction,
    });
    setIsMenuOpen(false);
  };

  const sortedLabel = sortState ? propertyLabelById.get(sortState.columnId) ?? sortState.columnId : null;
  const sortDirectionSymbol = sortState?.direction === 'asc' ? '↑' : '↓';

  if (readOnly) {
    if (sortState) {
      return (
        <span className="inline-flex items-center gap-1 truncate text-metadata text-grey-04">
          <span className="text-button leading-none">{sortDirectionSymbol}</span>
          <span className="truncate">{sortedLabel}</span>
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-1 truncate text-metadata text-grey-04">
        <span className="inline-flex items-center leading-none">
          <span className="text-button leading-none">↑</span>
          <span className="text-button leading-none">↓</span>
        </span>
        <span>Sort</span>
      </span>
    );
  }

  return (
    <Dropdown.Root
      open={isMenuOpen}
      onOpenChange={open => {
        setIsMenuOpen(open);
        if (open) {
          setMenuStep('fields');
          setPendingPropertyId(sortState?.columnId ?? null);
        }
      }}
    >
      <Dropdown.Trigger asChild>
        <button
          type="button"
          className={cx(
            'inline-flex h-6 items-center gap-1.5 rounded border px-1.5 text-metadata transition focus:outline-hidden',
            sortState
              ? 'border-grey-02 bg-grey-01 text-text hover:border-text'
              : 'border-grey-02 bg-white text-text shadow-button hover:border-text'
          )}
        >
          {sortState ? (
            <>
              <span className="text-button leading-none">{sortDirectionSymbol}</span>
              <span className="truncate">{sortedLabel}</span>
              <button
                type="button"
                className="inline-flex h-4 w-4 items-center justify-center text-grey-04 hover:text-black"
                onPointerDown={e => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onClick={e => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleClearSort();
                }}
                aria-label="Clear sort"
              >
                <Close color="grey-04" />
              </button>
            </>
          ) : (
            <>
              <span className="inline-flex items-center leading-none">
                <span className="text-button leading-none">↑</span>
                <span className="text-button leading-none">↓</span>
              </span>
              <span>Sort</span>
              <span className={cx('inline-flex shrink-0 transition-transform', isMenuOpen && 'rotate-180')}>
                <ChevronDownSmall color="grey-04" />
              </span>
            </>
          )}
        </button>
      </Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content
          sideOffset={8}
          className="z-100 block w-[320px] overflow-hidden rounded-2xl border border-grey-02 bg-white shadow-lg"
          align="start"
        >
          {menuStep === 'fields' && (
            <>
              {sortableProperties.map(property => {
                const label = property.id === SystemIds.NAME_PROPERTY ? 'Name' : (property.name ?? property.id);

                return (
                  <MenuItem key={property.id} className="text-button" onClick={() => {
                    setPendingPropertyId(property.id);
                    setMenuStep('direction');
                  }}>
                    <div className="flex w-full items-center justify-between gap-2">
                      <span>{label}</span>
                      <span className="text-grey-04">›</span>
                    </div>
                  </MenuItem>
                );
              })}
            </>
          )}
          {menuStep === 'direction' && pendingPropertyId && (
            <>
              <div className="border-b border-grey-02 px-3 py-2">
                <button type="button" className="text-button text-grey-04 transition-colors hover:text-text" onClick={() => setMenuStep('fields')}>
                  ← Back
                </button>
              </div>
              <MenuItem className="text-button" onClick={() => applySort('asc')}>
                <div className="flex w-full items-center justify-between gap-2">
                  <span>Ascending</span>
                  <span>↑</span>
                </div>
              </MenuItem>
              <MenuItem className="text-button" onClick={() => applySort('desc')}>
                <div className="flex w-full items-center justify-between gap-2">
                  <span>Descending</span>
                  <span>↓</span>
                </div>
              </MenuItem>
            </>
          )}
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  );
}
