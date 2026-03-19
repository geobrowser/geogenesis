import * as React from 'react';

import cx from 'classnames';

import { ColumnSortState, nextSortDirection } from '~/core/utils/column-sort';

import { ChevronDownSmall } from '~/design-system/icons/chevron-down-small';
import { Text } from '~/design-system/text';

interface SortableColumnHeaderProps {
  columnId: string;
  label: string;
  sort: ColumnSortState;
  onSort: (next: ColumnSortState) => void;
  variant?: 'smallTitle' | 'metadata';
  children?: React.ReactNode;
}

export function SortableColumnHeader({
  columnId,
  label,
  sort,
  onSort,
  variant = 'smallTitle',
  children,
}: SortableColumnHeaderProps) {
  const isActive = sort?.columnId === columnId;
  const direction = isActive ? sort.direction : null;

  const handleClick = (e: React.MouseEvent) => {
    // Don't intercept clicks on child interactive elements (rename input, nested buttons)
    const target = e.target as HTMLElement;
    const closestInteractive = target.closest('input, button, [role=button]');
    if (closestInteractive && closestInteractive !== e.currentTarget) return;
    onSort(nextSortDirection(sort, columnId));
  };

  return (
    <button type="button" onClick={handleClick} className="flex w-full items-center gap-1 text-left">
      {children ?? (
        <Text variant={variant} className="truncate">
          {label}
        </Text>
      )}
      <span
        className={cx(
          '-my-2 ml-auto shrink-0 transition-opacity',
          isActive ? 'opacity-100' : 'opacity-0 group-hover/header:opacity-75'
        )}
      >
        {isActive ? (
          <span className={cx('inline-block', direction === 'asc' && 'rotate-180')}>
            <ChevronDownSmall color="text" />
          </span>
        ) : (
          <span className="flex flex-col items-center gap-0.5">
            <span className="inline-block rotate-180">
              <ChevronDownSmall color="grey-03" />
            </span>
            <ChevronDownSmall color="grey-03" />
          </span>
        )}
      </span>
    </button>
  );
}
