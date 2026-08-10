'use client';

import * as React from 'react';

import { SmallButton } from '~/design-system/button';
import { ThumbGeoImage } from '~/design-system/geo-image';
import { ChevronDownSmall } from '~/design-system/icons/chevron-down-small';
import { TickSmall } from '~/design-system/icons/tick-small';
import { Menu } from '~/design-system/menu';
import { Text } from '~/design-system/text';

export type HubFilterOption<T extends string> = {
  value: T;
  label: string;
  image?: string | null;
  showImage?: boolean;
};

type Props<T extends string> = {
  label: string;
  options: HubFilterOption<T>[];
  value: T;
  onChange: (value: T) => void;
  showImages?: boolean;
};

/**
 * State-driven sibling of `GovernanceFilterMenu` — the hub filters live in local state instead of
 * the URL, so options are buttons rather than links.
 */
export function HubFilterMenu<T extends string>({ label, options, value, onChange, showImages }: Props<T>) {
  const [open, setOpen] = React.useState(false);

  return (
    <Menu
      open={open}
      onOpenChange={setOpen}
      asChild
      className="max-w-[280px]"
      // Space names come from the knowledge graph and can be long enough to burst the pill.
      trigger={
        <SmallButton icon={<ChevronDownSmall />} className="max-w-[160px]">
          <span className="truncate">{label}</span>
        </SmallButton>
      }
    >
      <>
        {options.map(option => (
          <button
            key={option.value}
            type="button"
            onClick={() => {
              onChange(option.value);
              setOpen(false);
            }}
            className="flex w-full cursor-pointer items-center gap-2 bg-white px-3 py-2.5 text-left hover:bg-bg"
          >
            {showImages && option.showImage !== false ? (
              option.image ? (
                <span className="relative h-5 w-5 shrink-0 overflow-hidden rounded-md">
                  <ThumbGeoImage value={option.image} alt="" />
                </span>
              ) : (
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-grey-01 text-[10px] font-medium text-grey-04">
                  {(option.label.trim().slice(0, 1).toUpperCase() || '?').replace(/[^A-Z0-9?]/g, '?')}
                </span>
              )
            ) : null}
            <Text variant="button" className="truncate hover:text-text!">
              {option.label}
            </Text>
            {option.value === value ? (
              <span className="ml-auto shrink-0">
                <TickSmall />
              </span>
            ) : null}
          </button>
        ))}
      </>
    </Menu>
  );
}
