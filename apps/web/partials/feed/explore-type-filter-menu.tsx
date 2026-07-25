'use client';

import * as React from 'react';

import cx from 'classnames';

import { EXPLORE_ENTITY_TYPES } from '~/core/explore/explore-constants';
import { exploreTypeFilterLabel } from '~/core/explore/explore-type-filter';

import { CheckboxVisual } from '~/design-system/checkbox';
import { ChevronDownSmall } from '~/design-system/icons/chevron-down-small';
import { Menu, MenuItem } from '~/design-system/menu';

type Props = {
  selectedTypeIds: readonly string[];
  onToggleType: (typeId: string) => void;
};

export function ExploreTypeFilterMenu({ selectedTypeIds, onToggleType }: Props) {
  const [open, setOpen] = React.useState(false);
  const selected = React.useMemo(() => new Set(selectedTypeIds), [selectedTypeIds]);
  const label = exploreTypeFilterLabel(selected.size);

  return (
    <Menu
      asChild
      open={open}
      onOpenChange={setOpen}
      sideOffset={8}
      className="max-w-60 bg-white"
      trigger={
        <button
          type="button"
          className="flex h-6 items-center gap-1.5 rounded border border-grey-02 pr-2 pl-1.5 text-metadata text-grey-04 shadow-button transition-colors duration-150 focus-within:border-text"
        >
          <span>{label}</span>
          <span className={cx('inline-flex transition-transform duration-200', open && 'rotate-180')}>
            <ChevronDownSmall color="grey-04" />
          </span>
        </button>
      }
    >
      {EXPLORE_ENTITY_TYPES.map(type => {
        const checked = selected.has(type.id);
        return (
          <MenuItem key={type.id} onClick={() => onToggleType(type.id)}>
            <CheckboxVisual checked={checked} />
            <span>{type.label}</span>
            <span className="sr-only">{checked ? 'Selected' : 'Not selected'}</span>
          </MenuItem>
        );
      })}
    </Menu>
  );
}
