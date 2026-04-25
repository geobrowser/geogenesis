'use client';

import { SystemIds } from '@geoprotocol/geo-sdk/lite';
import * as Dropdown from '@radix-ui/react-dropdown-menu';

import * as React from 'react';

import cx from 'classnames';

import { ID } from '~/core/id';
import { Property } from '~/core/types';
import { ColumnSortState, SORTABLE_DATA_TYPES } from '~/core/utils/column-sort';

import { SmallButton } from '~/design-system/button';
import { ArrowLeft } from '~/design-system/icons/arrow-left';
import { ChevronRight } from '~/design-system/icons/chevron-right';
import { Close } from '~/design-system/icons/close';
import { SortTable } from '~/design-system/icons/sort-table';
import { SortOrderArrow } from '~/design-system/icons/sort-order-arrow';
import { MenuItem } from '~/design-system/menu';
import { trapWheelToElement } from '~/design-system/trap-wheel-scroll';
import { useAdaptiveDropdownPlacement } from '~/design-system/use-adaptive-dropdown-placement';

const SORT_MENU_SURFACE =
  'z-100 block max-h-[180px] min-w-0 w-[200px] overscroll-contain overflow-y-auto scroll-smooth rounded-lg border border-grey-02 bg-white shadow-lg';

type DataBlockSortMenuProps = {
  properties: Property[];
  sortState: ColumnSortState;
  onSort: (next: ColumnSortState) => void;
  triggerVariant?: 'icon' | 'segment';
  disabled?: boolean;
  /** When false, an active sort is read-only (no clear, menu does not open on the chip). */
  isEditing?: boolean;
};

const segmentShellClassName =
  'inline-flex h-6 max-w-[min(280px,calc(100vw-120px))] shrink-0 items-stretch overflow-hidden rounded border border-grey-02 bg-white text-metadata leading-none text-text shadow-button transition hover:border-text hover:bg-bg focus-within:outline-hidden';

const segmentTriggerButtonClassName =
  'inline-flex min-h-6 min-w-0 flex-1 flex-row items-center gap-1.5 border-0 bg-transparent px-1.5 py-0 text-inherit shadow-none hover:bg-bg/80 focus:outline-hidden disabled:pointer-events-none';

const readOnlySortSegmentClass =
  'inline-flex h-6 max-w-[min(280px,calc(100vw-120px))] shrink-0 items-center gap-1.5 rounded-md border-0 bg-grey-01 px-2 text-metadata leading-none text-text';

function propertySortLabel(property: Property): string {
  return property.id === SystemIds.NAME_PROPERTY ? 'Name' : (property.name ?? property.id);
}

function sortColumnDisplayLabel(sortState: NonNullable<ColumnSortState>, props: Property[]): string {
  const p = props.find(prop => ID.equals(prop.id, sortState.columnId));
  if (p) return propertySortLabel(p);
  return ID.equals(sortState.columnId, SystemIds.NAME_PROPERTY) ? 'Name' : sortState.columnId;
}

export function DataBlockSortMenu({
  properties,
  sortState,
  onSort,
  triggerVariant = 'icon',
  disabled = false,
  isEditing = true,
}: DataBlockSortMenuProps) {
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const { align, side } = useAdaptiveDropdownPlacement(triggerRef, {
    isOpen: isMenuOpen,
    preferredHeight: 180,
    gap: 8,
  });
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

  const onContentWheel = React.useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    trapWheelToElement(e.currentTarget, e);
  }, []);

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

  React.useEffect(() => {
    if (pickDirectionForColumnId !== null && pickedProperty === null) {
      setPickDirectionForColumnId(null);
    }
  }, [pickDirectionForColumnId, pickedProperty]);

  const segmentSortReadOnly = Boolean(sortState !== null && !isEditing);
  const segmentTriggerDisabled = disabled || segmentSortReadOnly;

  const menuContent = (
    <Dropdown.Portal>
      <Dropdown.Content
        side={side}
        align={align}
        sideOffset={8}
        avoidCollisions={true}
        collisionPadding={8}
        className={SORT_MENU_SURFACE}
        onWheel={onContentWheel}
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
  );

  if (triggerVariant === 'segment') {
    return (
      <Dropdown.Root open={isMenuOpen} onOpenChange={onOpenChange}>
        {sortState === null ? (
          !isEditing ? (
            <Dropdown.Trigger asChild disabled>
              <div className={cx(readOnlySortSegmentClass, 'pointer-events-none cursor-default')}>
                <span className="inline-flex shrink-0 tabular-nums text-text" aria-hidden>
                  ↑↓
                </span>
                <span className="min-w-0 truncate">Sort</span>
              </div>
            </Dropdown.Trigger>
          ) : (
            <Dropdown.Trigger asChild disabled={disabled}>
              <SmallButton
                ref={triggerRef}
                icon={
                  <span className="inline-flex shrink-0 tabular-nums text-grey-04" aria-hidden>
                    ↑↓
                  </span>
                }
                variant="secondary"
                disabled={disabled}
              >
                Sort
              </SmallButton>
            </Dropdown.Trigger>
          )
        ) : (
          <div
            className={cx(
              segmentShellClassName,
              segmentSortReadOnly && 'border-0 bg-grey-01 shadow-none hover:border-0 hover:bg-grey-01'
            )}
          >
            <Dropdown.Trigger asChild disabled={segmentTriggerDisabled}>
              <button
                ref={triggerRef}
                type="button"
                className={cx(
                  segmentTriggerButtonClassName,
                  segmentSortReadOnly && 'cursor-default hover:bg-transparent'
                )}
              >
                <span className="shrink-0 text-text" aria-hidden>
                  <SortOrderArrow direction={sortState.direction} color="text" />
                </span>
                <span className="min-w-0 flex-1 truncate text-left text-text">
                  {sortColumnDisplayLabel(sortState, properties)}
                </span>
              </button>
            </Dropdown.Trigger>
            {isEditing && (
              <button
                type="button"
                disabled={disabled}
                className="inline-flex shrink-0 items-center justify-center border-l border-divider px-1.5 text-text transition hover:bg-black/[0.04] focus:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-grey-04"
                aria-label="Clear sort"
                onPointerDown={e => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onClick={e => {
                  e.preventDefault();
                  e.stopPropagation();
                  onSort(null);
                  setIsMenuOpen(false);
                  setPickDirectionForColumnId(null);
                }}
              >
                <Close color="text" />
              </button>
            )}
          </div>
        )}
        {menuContent}
      </Dropdown.Root>
    );
  }

  return (
    <Dropdown.Root open={isMenuOpen} onOpenChange={onOpenChange}>
      <Dropdown.Trigger asChild disabled={disabled}>
        <button
          ref={triggerRef}
          type="button"
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded border border-transparent text-grey-04 transition hover:border-grey-02 hover:bg-bg focus:outline-hidden disabled:pointer-events-none disabled:opacity-50"
          aria-label={sortState ? `Sorted by ${sortColumnDisplayLabel(sortState, properties)}` : 'Sort'}
        >
          {isMenuOpen ? <Close color="grey-04" /> : <SortTable color={sortState ? 'text' : 'grey-04'} />}
        </button>
      </Dropdown.Trigger>
      {menuContent}
    </Dropdown.Root>
  );
}
