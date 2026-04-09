'use client';

import { SystemIds } from '@geoprotocol/geo-sdk/lite';
import * as Dropdown from '@radix-ui/react-dropdown-menu';

import * as React from 'react';

import cx from 'classnames';

import { Property } from '~/core/types';
import { ColumnSortState, SORTABLE_DATA_TYPES, nextSortDirection } from '~/core/utils/column-sort';

import { ChevronDownSmall } from '~/design-system/icons/chevron-down-small';
import { Close } from '~/design-system/icons/close';
import { SortTable } from '~/design-system/icons/sort-table';
import { MenuItem } from '~/design-system/menu';

type DataBlockSortMenuProps = {
  properties: Property[];
  sortState: ColumnSortState;
  onSort: (next: ColumnSortState) => void;
};

export function DataBlockSortMenu({ properties, sortState, onSort }: DataBlockSortMenuProps) {
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);

  const onOpenChange = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  const handleSort = (propertyId: string) => {
    onSort(nextSortDirection(sortState, propertyId));
  };

  const handleClearSort = () => {
    onSort(null);
    setIsMenuOpen(false);
  };

  return (
    <Dropdown.Root open={isMenuOpen} onOpenChange={onOpenChange}>
      <Dropdown.Trigger>
        {isMenuOpen ? <Close color="grey-04" /> : <SortTable color={sortState ? 'text' : 'grey-04'} />}
      </Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content
          sideOffset={8}
          className="z-100 block max-h-[356px] w-[200px]! overflow-y-auto rounded-lg border border-grey-02 bg-white shadow-lg"
          align="end"
        >
          {properties
            .filter(p => SORTABLE_DATA_TYPES.includes(p.dataType))
            .map(property => {
              const isActive = sortState?.columnId === property.id;
              const label = property.id === SystemIds.NAME_PROPERTY ? 'Name' : (property.name ?? property.id);

              return (
                <MenuItem key={property.id} onClick={() => handleSort(property.id)}>
                  <div className="flex w-full items-center justify-between gap-2">
                    <span className={cx(isActive && 'font-medium')}>{label}</span>
                    {isActive && (
                      <span
                        className={cx(
                          'inline-block transition-transform',
                          sortState.direction === 'asc' && 'rotate-180'
                        )}
                      >
                        <ChevronDownSmall color="text" />
                      </span>
                    )}
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
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  );
}
