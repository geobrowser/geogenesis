'use client';

import * as Dropdown from '@radix-ui/react-dropdown-menu';

import * as React from 'react';

import cx from 'classnames';

import { ID } from '~/core/id';
import { Property } from '~/core/types';
import {
  BUILT_IN_SORT_OPTIONS,
  BuiltInSort,
  ColumnSortState,
  DEFAULT_TABLE_SORT_PROPERTIES,
  SORTABLE_DATA_TYPES,
  SortDirection,
  propertySortLabel,
  sortStateLabel,
} from '~/core/utils/column-sort';

import { SmallButton } from '~/design-system/button';
import { ArrowLeft } from '~/design-system/icons/arrow-left';
import { ChevronRight } from '~/design-system/icons/chevron-right';
import { Close } from '~/design-system/icons/close';
import { MenuItem } from '~/design-system/menu';
import { trapWheelToElement } from '~/design-system/trap-wheel-scroll';
import { useAdaptiveDropdownPlacement } from '~/design-system/use-adaptive-dropdown-placement';

const listScrollClassName =
  'max-h-[198px] min-h-0 overflow-y-auto overscroll-contain scroll-smooth snap-y snap-mandatory';
const listRowClassName = 'snap-start min-h-[44px] shrink-0';

type DataBlockSortMenuProps = {
  properties: Property[];
  shownColumnIds?: string[];
  sortState: ColumnSortState;
  onSort: (next: ColumnSortState) => void;
  triggerVariant?: 'icon' | 'segment';
  disabled?: boolean;
  /** When false, an active sort is read-only (grey chip, no clear, menu closed). */
  isEditing?: boolean;
};

/** What the Ascending / Descending step is choosing a direction for. */
type DirectionPickTarget = { kind: 'property'; columnId: string } | { kind: 'builtin'; sort: BuiltInSort };

export function DataBlockSortMenu({
  properties,
  shownColumnIds = [],
  sortState,
  onSort,
  triggerVariant = 'icon',
  disabled = false,
  isEditing = true,
}: DataBlockSortMenuProps) {
  const triggerRef = React.useRef<Element | null>(null);
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const [directionPickTarget, setDirectionPickTarget] = React.useState<DirectionPickTarget | null>(null);
  const [contentElement, setContentElement] = React.useState<HTMLDivElement | null>(null);

  const { align, side } = useAdaptiveDropdownPlacement(triggerRef, {
    isOpen: isMenuOpen,
    preferredHeight: 260,
    gap: 8,
    contentElement,
  });

  const onListWheel = React.useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    trapWheelToElement(e.currentTarget, e);
  }, []);

  const sortableProperties = React.useMemo(() => {
    const propertyById = new Map<string, Property>();

    for (const property of DEFAULT_TABLE_SORT_PROPERTIES) {
      propertyById.set(property.id, property);
    }
    for (const property of properties) {
      if (!propertyById.has(property.id)) {
        propertyById.set(property.id, property);
      }
    }

    const ordered: Property[] = [];
    const seen = new Set<string>();

    for (const property of DEFAULT_TABLE_SORT_PROPERTIES) {
      if (seen.has(property.id)) continue;
      seen.add(property.id);
      ordered.push(propertyById.get(property.id) ?? property);
    }

    for (const id of shownColumnIds) {
      const property = propertyById.get(id);
      if (!property || seen.has(property.id)) continue;
      seen.add(property.id);
      ordered.push(property);
    }

    for (const property of properties) {
      if (seen.has(property.id)) continue;
      seen.add(property.id);
      ordered.push(property);
    }

    return ordered.filter(p => SORTABLE_DATA_TYPES.includes(p.dataType));
  }, [properties, shownColumnIds]);

  const onOpenChange = (open: boolean) => {
    setIsMenuOpen(open);
    if (!open) {
      setDirectionPickTarget(null);
    }
  };

  const applySortAndClose = React.useCallback(
    (next: NonNullable<ColumnSortState>) => {
      onSort(next);
      setIsMenuOpen(false);
      setDirectionPickTarget(null);
    },
    [onSort]
  );

  const pickedProperty =
    directionPickTarget?.kind === 'property'
      ? (sortableProperties.find(p => p.id === directionPickTarget.columnId) ?? null)
      : null;

  // A property that drops out of the list (e.g. the type filter changed) closes its direction step.
  React.useEffect(() => {
    if (directionPickTarget?.kind === 'property' && pickedProperty === null) {
      setDirectionPickTarget(null);
    }
  }, [directionPickTarget, pickedProperty]);

  const builtInPickTarget = directionPickTarget?.kind === 'builtin' ? directionPickTarget : null;
  const pendingSort = React.useMemo<((direction: SortDirection) => NonNullable<ColumnSortState>) | null>(() => {
    if (builtInPickTarget) {
      const sort = builtInPickTarget.sort;
      return direction => ({ kind: 'builtin', sort, direction });
    }
    if (pickedProperty) {
      const columnId = pickedProperty.id;
      return direction => ({ kind: 'property', columnId, direction });
    }
    return null;
  }, [builtInPickTarget, pickedProperty]);

  const segmentSortReadOnly = Boolean(sortState !== null && !isEditing);
  const segmentTriggerDisabled = disabled || segmentSortReadOnly;
  const readOnlySortSegmentClass =
    'inline-flex h-6 max-w-[min(240px,calc(100vw-120px))] shrink-0 items-center gap-1.5 rounded-md border-0 bg-grey-01 px-2 text-metadata leading-none text-text';

  return (
    <Dropdown.Root open={isMenuOpen} onOpenChange={onOpenChange}>
      {triggerVariant === 'segment' ? (
        sortState === null ? (
          !isEditing ? (
            <Dropdown.Trigger asChild disabled>
              <div
                ref={triggerRef as React.Ref<HTMLDivElement>}
                className={cx(readOnlySortSegmentClass, 'pointer-events-none cursor-default')}
              >
                <span className="inline-flex shrink-0 text-text tabular-nums" aria-hidden>
                  ↑↓
                </span>
                <span className="min-w-0 truncate">Sort</span>
              </div>
            </Dropdown.Trigger>
          ) : (
            <Dropdown.Trigger asChild disabled={disabled}>
              <SmallButton
                ref={triggerRef as React.Ref<HTMLButtonElement>}
                icon={
                  <span className="inline-flex shrink-0 text-grey-04 tabular-nums" aria-hidden>
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
          <div className="inline-flex h-6 max-w-[min(240px,calc(100vw-120px))] shrink-0 items-stretch overflow-hidden rounded-md border-0 bg-grey-01 text-metadata leading-none text-text">
            <Dropdown.Trigger asChild disabled={segmentTriggerDisabled}>
              <button
                ref={triggerRef as React.Ref<HTMLButtonElement>}
                type="button"
                className={cx(
                  'flex min-w-0 flex-1 flex-row items-center gap-1.5 px-2 text-left transition outline-none select-none',
                  isEditing &&
                    'hover:bg-black/[0.04] focus-visible:ring-2 focus-visible:ring-grey-04 focus-visible:ring-offset-0',
                  segmentSortReadOnly && 'cursor-default'
                )}
              >
                <span className="shrink-0 text-text tabular-nums" aria-hidden>
                  {sortState.direction === 'asc' ? '↑' : '↓'}
                </span>
                <span className="min-w-0 flex-1 truncate text-text">{sortStateLabel(sortState, properties)}</span>
              </button>
            </Dropdown.Trigger>
            {isEditing && (
              <button
                type="button"
                disabled={disabled}
                className="inline-flex shrink-0 items-center justify-center border-l border-divider px-1.5 text-text transition hover:bg-black/[0.04] focus:outline-hidden focus-visible:ring-2 focus-visible:ring-grey-04 focus-visible:ring-inset"
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
                  setDirectionPickTarget(null);
                }}
              >
                <Close color="text" />
              </button>
            )}
          </div>
        )
      ) : (
        <Dropdown.Trigger asChild disabled={disabled}>
          <button
            ref={triggerRef as React.Ref<HTMLButtonElement>}
            type="button"
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded border-none bg-transparent text-grey-04 transition hover:bg-bg focus:outline-hidden focus-visible:ring-2 focus-visible:ring-grey-04"
            aria-label="Sort"
            aria-expanded={isMenuOpen}
          >
            <span
              className={cx(
                'inline-flex shrink-0 items-center gap-px tabular-nums',
                sortState ? 'text-text' : 'text-grey-04'
              )}
              aria-hidden
            >
              {sortState ? (
                sortState.direction === 'asc' ? (
                  <span>↑</span>
                ) : (
                  <span>↓</span>
                )
              ) : (
                <>
                  <span>↑</span>
                  <span>↓</span>
                </>
              )}
            </span>
          </button>
        </Dropdown.Trigger>
      )}
      <Dropdown.Portal>
        <Dropdown.Content
          ref={setContentElement}
          side={side}
          align={align}
          sideOffset={8}
          avoidCollisions={true}
          collisionPadding={8}
          className="z-1001 w-[200px] overflow-hidden rounded-lg border border-grey-02 bg-white shadow-lg"
        >
          <div className={listScrollClassName} onWheel={onListWheel}>
            {pendingSort === null ? (
              <>
                {BUILT_IN_SORT_OPTIONS.map(option => {
                  const isActive = sortState?.kind === 'builtin' && sortState.sort === option.sort;
                  // A single offered direction applies on click; otherwise open the direction step.
                  const directDirection = option.directions.length === 1 ? option.directions[0] : undefined;

                  return (
                    <MenuItem
                      key={option.sort}
                      className={listRowClassName}
                      onClick={() =>
                        directDirection !== undefined
                          ? applySortAndClose({ kind: 'builtin', sort: option.sort, direction: directDirection })
                          : setDirectionPickTarget({ kind: 'builtin', sort: option.sort })
                      }
                    >
                      <div className="flex w-full items-center justify-between gap-2">
                        <span className={cx('min-w-0 truncate text-left', isActive && 'font-medium')}>
                          {option.label}
                        </span>
                        {directDirection !== undefined ? (
                          <span className="shrink-0 text-grey-04 tabular-nums" aria-hidden>
                            {directDirection === 'asc' ? '↑' : '↓'}
                          </span>
                        ) : (
                          <span className="inline-flex shrink-0 text-grey-04 [&_svg]:h-3.5 [&_svg]:w-3.5">
                            <ChevronRight color="grey-04" />
                          </span>
                        )}
                      </div>
                    </MenuItem>
                  );
                })}
                <div className="shrink-0 snap-none border-t border-grey-02" role="presentation" />
                {sortableProperties.map(property => {
                  const isActive = sortState?.kind === 'property' && ID.equals(sortState.columnId, property.id);
                  const label = propertySortLabel(property);

                  return (
                    <MenuItem
                      key={property.id}
                      className={listRowClassName}
                      onClick={() => setDirectionPickTarget({ kind: 'property', columnId: property.id })}
                    >
                      <div className="flex w-full items-center justify-between gap-2">
                        <span className={cx('min-w-0 truncate text-left', isActive && 'font-medium')}>{label}</span>
                        <span className="inline-flex shrink-0 text-grey-04 [&_svg]:h-3.5 [&_svg]:w-3.5">
                          <ChevronRight color="grey-04" />
                        </span>
                      </div>
                    </MenuItem>
                  );
                })}
              </>
            ) : (
              <>
                <MenuItem className={listRowClassName} onClick={() => setDirectionPickTarget(null)}>
                  <div className="flex w-full items-center gap-2">
                    <ArrowLeft color="grey-04" />
                    <span>Back</span>
                  </div>
                </MenuItem>
                <div className="shrink-0 snap-none border-t border-grey-02" role="presentation" />
                <MenuItem className={listRowClassName} onClick={() => applySortAndClose(pendingSort('asc'))}>
                  <div className="flex w-full items-center justify-between gap-2">
                    <span>Ascending</span>
                    <span className="shrink-0 text-text tabular-nums" aria-hidden>
                      <span>↑</span>
                    </span>
                  </div>
                </MenuItem>
                <MenuItem className={listRowClassName} onClick={() => applySortAndClose(pendingSort('desc'))}>
                  <div className="flex w-full items-center justify-between gap-2">
                    <span>Descending</span>
                    <span className="shrink-0 text-text tabular-nums" aria-hidden>
                      <span>↓</span>
                    </span>
                  </div>
                </MenuItem>
              </>
            )}
          </div>
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  );
}
