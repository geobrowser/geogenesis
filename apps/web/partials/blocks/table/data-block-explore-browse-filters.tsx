'use client';

import * as React from 'react';

import cx from 'classnames';

import type { ExploreBlockTypeOption } from '~/core/blocks/data/explore-browse-filters';
import { EXPLORE_TIME_OPTIONS, type ExploreTime } from '~/core/explore/explore-time';

import { CheckboxVisual } from '~/design-system/checkbox';
import { ChevronDownSmall } from '~/design-system/icons/chevron-down-small';
import { Menu, MenuItem } from '~/design-system/menu';

type Props = {
  time: ExploreTime;
  onTimeChange: (time: ExploreTime) => void;
  typeOptions: readonly ExploreBlockTypeOption[];
  selectedTypeIds: readonly string[];
  onToggleType: (typeId: string) => void;
  onToggleAllTypes: () => void;
};

const triggerClassName =
  'flex h-6 items-center gap-1.5 rounded border border-grey-02 pr-2 pl-1.5 text-metadata text-grey-04 shadow-button transition-colors duration-150 focus-within:border-text';

export function DataBlockExploreBrowseFilters({
  time,
  onTimeChange,
  typeOptions,
  selectedTypeIds,
  onToggleType,
  onToggleAllTypes,
}: Props) {
  const [timeMenuOpen, setTimeMenuOpen] = React.useState(false);
  const [typeMenuOpen, setTypeMenuOpen] = React.useState(false);
  const selectedTypes = React.useMemo(() => new Set(selectedTypeIds), [selectedTypeIds]);
  const timeLabel = EXPLORE_TIME_OPTIONS.find(option => option.value === time)?.label ?? time;
  const typeLabel = `${selectedTypes.size} ${selectedTypes.size === 1 ? 'type' : 'types'}`;
  const allTypesSelected = selectedTypes.size === typeOptions.length;

  return (
    <>
      <Menu
        asChild
        open={timeMenuOpen}
        onOpenChange={setTimeMenuOpen}
        sideOffset={8}
        className="max-w-60 bg-white"
        trigger={
          <button type="button" className={triggerClassName}>
            <span>{timeLabel}</span>
            <span className={cx('inline-flex transition-transform duration-200', timeMenuOpen && 'rotate-180')}>
              <ChevronDownSmall color="grey-04" />
            </span>
          </button>
        }
      >
        {EXPLORE_TIME_OPTIONS.map(option => (
          <MenuItem
            key={option.value}
            active={option.value === time}
            onClick={() => {
              onTimeChange(option.value);
              setTimeMenuOpen(false);
            }}
          >
            {option.label}
          </MenuItem>
        ))}
      </Menu>

      {typeOptions.length > 0 ? (
        <Menu
          asChild
          open={typeMenuOpen}
          onOpenChange={setTypeMenuOpen}
          sideOffset={8}
          className="max-w-60 bg-white"
          trigger={
            <button type="button" className={triggerClassName}>
              <span>{typeLabel}</span>
              <span className={cx('inline-flex transition-transform duration-200', typeMenuOpen && 'rotate-180')}>
                <ChevronDownSmall color="grey-04" />
              </span>
            </button>
          }
        >
          <MenuItem className="border-b border-grey-02" onClick={onToggleAllTypes}>
            {allTypesSelected ? 'Unselect all' : 'Select all'}
          </MenuItem>
          {typeOptions.map(type => {
            const checked = selectedTypes.has(type.id);
            return (
              <MenuItem key={type.id} onClick={() => onToggleType(type.id)}>
                <CheckboxVisual checked={checked} />
                <span>{type.label}</span>
                <span className="sr-only">{checked ? 'Selected' : 'Not selected'}</span>
              </MenuItem>
            );
          })}
        </Menu>
      ) : null}
    </>
  );
}
