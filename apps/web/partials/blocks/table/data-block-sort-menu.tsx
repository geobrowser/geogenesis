'use client';

import { SystemIds } from '@geoprotocol/geo-sdk/lite';
import * as Dropdown from '@radix-ui/react-dropdown-menu';

import * as React from 'react';

import cx from 'classnames';

import { ID } from '~/core/id';
import { Property } from '~/core/types';
import { ColumnSortState, SORTABLE_DATA_TYPES } from '~/core/utils/column-sort';

import { ArrowLeft } from '~/design-system/icons/arrow-left';
import { ChevronDownSmall } from '~/design-system/icons/chevron-down-small';
import { ChevronRight } from '~/design-system/icons/chevron-right';
import { Close } from '~/design-system/icons/close';
import { SortArrows } from '~/design-system/icons/sort-arrows';
import { SortOrderArrow } from '~/design-system/icons/sort-order-arrow';
import { MenuItem } from '~/design-system/menu';

type DataBlockSortMenuProps = {
  properties: Property[];
  sortState: ColumnSortState;
  onSort: (next: ColumnSortState) => void;
  triggerVariant?: 'icon' | 'segment';
  disabled?: boolean;
};

const segmentShellClassName =
  'inline-flex h-6 max-w-[min(280px,calc(100vw-120px))] shrink-0 items-stretch overflow-hidden rounded border border-grey-02 bg-white text-metadata leading-none text-text shadow-button transition hover:border-text hover:bg-bg focus-within:outline-hidden';

const segmentTriggerButtonClassName =
  'inline-flex min-h-6 min-w-0 flex-1 items-center gap-1.5 border-0 bg-transparent px-1.5 py-0 text-inherit shadow-none hover:bg-bg/80 focus:outline-hidden disabled:pointer-events-none';

function propertySortLabel(property: Property): string {
  return property.id === SystemIds.NAME_PROPERTY ? 'Name' : (property.name ?? property.id);
}

export function DataBlockSortMenu({
  properties,
  sortState,
  onSort,
  triggerVariant = 'icon',
  disabled = false,
}: DataBlockSortMenuProps) {
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const [pickDirectionForColumnId, setPickDirectionForColumnId] = React.useState<string | null>(null);

  const sortableProperties = React.useMemo(
    () => properties.filter(p => SORTABLE_DATA_TYPES.includes(p.dataType)),
    [properties]
  );

  const onOpenChange = (open: boolean) => {
    setIsMenuOpen(open);
    if (!open) {
      setPickDirectionForColumnId(null);
    }
  };

  const applySortAndClose = React.useCallback(
    (columnId: string, direction: 'asc' | 'desc') => {
      onSort({ columnId, direction });
      setIsMenuOpen(false);
      setPickDirectionForColumnId(null);
    },
    [onSort]
  );

  const handleClearSort = () => {
    onSort(null);
    setIsMenuOpen(false);
    setPickDirectionForColumnId(null);
  };

  const pickedProperty =
    pickDirectionForColumnId === null ? null : sortableProperties.find(p => p.id === pickDirectionForColumnId) ?? null;

  const activeSortLabel = React.useMemo(() => {
    if (!sortState) return null;
    const p =
      sortableProperties.find(x => ID.equals(x.id, sortState.columnId)) ??
      properties.find(x => ID.equals(x.id, sortState.columnId));
    return p ? propertySortLabel(p) : sortState.columnId;
  }, [sortState, sortableProperties, properties]);

  React.useEffect(() => {
    if (pickDirectionForColumnId !== null && pickedProperty === null) {
      setPickDirectionForColumnId(null);
    }
  }, [pickDirectionForColumnId, pickedProperty]);

  return (
    <Dropdown.Root open={isMenuOpen} onOpenChange={onOpenChange}>
      {triggerVariant === 'segment' ? (
        <div className={cx(segmentShellClassName, disabled && 'pointer-events-none opacity-50')}>
          <Dropdown.Trigger asChild disabled={disabled}>
            <button type="button" className={segmentTriggerButtonClassName}>
              {sortState ? (
                <>
                  <span className="inline-flex shrink-0" aria-hidden>
                    <SortOrderArrow direction={sortState.direction} color="text" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-left">{activeSortLabel ?? sortState.columnId}</span>
                </>
              ) : (
                <>
                  <SortArrows color="grey-04" />
                  <span className="shrink-0">Sort</span>
                </>
              )}
              <span className={cx('inline-flex shrink-0 transition-transform', isMenuOpen && 'rotate-180')}>
                <ChevronDownSmall color="grey-04" />
              </span>
            </button>
          </Dropdown.Trigger>
          {sortState && (
            <button
              type="button"
              aria-label="Clear sort"
              disabled={disabled}
              onPointerDown={e => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onClick={e => {
                e.preventDefault();
                e.stopPropagation();
                handleClearSort();
              }}
              className="inline-flex shrink-0 items-center border-l border-grey-02 px-1.5 text-grey-04 transition hover:bg-bg hover:text-text"
            >
              <Close color="grey-04" />
            </button>
          )}
        </div>
      ) : (
        <Dropdown.Trigger asChild disabled={disabled}>
          {isMenuOpen ? (
            <Close color="grey-04" />
          ) : (
            <SortArrows color={sortState ? 'text' : 'grey-04'} />
          )}
        </Dropdown.Trigger>
      )}
      <Dropdown.Portal>
        <Dropdown.Content
          sideOffset={8}
          className="z-100 block max-h-[356px] w-[200px]! overflow-y-auto rounded-lg border border-grey-02 bg-white shadow-lg"
          align="start"
        >
          {pickDirectionForColumnId === null || pickedProperty === null ? (
            <>
              {sortableProperties.map(property => {
                const isActive = sortState !== null && ID.equals(sortState.columnId, property.id);
                const label = propertySortLabel(property);

                return (
                  <MenuItem key={property.id} onClick={() => setPickDirectionForColumnId(property.id)}>
                    <div className="flex w-full items-center justify-between gap-2">
                      <span className={cx('min-w-0 truncate text-left', isActive && 'font-medium')}>{label}</span>
                      <span className="inline-flex shrink-0 text-grey-04 [&_svg]:h-3.5 [&_svg]:w-3.5">
                        <ChevronRight color="grey-04" />
                      </span>
                    </div>
                  </MenuItem>
                );
              })}
              {sortState && (
                <div className="border-t border-grey-02 px-3 py-2 text-right">
                  <button
                    type="button"
                    onClick={handleClearSort}
                    className="text-smallButton text-ctaPrimary hover:text-ctaHover"
                  >
                    Clear sort
                  </button>
                </div>
              )}
            </>
          ) : (
            <>
              <MenuItem onClick={() => setPickDirectionForColumnId(null)}>
                <div className="flex w-full items-center gap-2">
                  <ArrowLeft color="grey-04" />
                  <span>Back</span>
                </div>
              </MenuItem>
              <div className="border-t border-grey-02" role="presentation" />
              <MenuItem onClick={() => applySortAndClose(pickedProperty.id, 'asc')}>
                <div className="flex w-full items-center justify-between gap-2">
                  <span>Ascending</span>
                  <SortOrderArrow direction="asc" color="text" />
                </div>
              </MenuItem>
              <MenuItem onClick={() => applySortAndClose(pickedProperty.id, 'desc')}>
                <div className="flex w-full items-center justify-between gap-2">
                  <span>Descending</span>
                  <SortOrderArrow direction="desc" color="text" />
                </div>
              </MenuItem>
            </>
          )}
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  );
}
