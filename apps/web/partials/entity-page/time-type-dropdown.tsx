'use client';

import * as DropdownPrimitive from '@radix-ui/react-dropdown-menu';
import cx from 'classnames';

import * as React from 'react';
import { useState } from 'react';

import { GeoDate } from '~/core/utils/utils';

import { SquareButton } from '~/design-system/button';
import { Check } from '~/design-system/icons/check';

interface Props {
  value?: string;
  onSelect: (value: string) => void;
}

const formatOptions: { value: string; label: React.ReactNode }[] = [
  { value: 'h:mm a, EEEE, MMMM d, yyyy', label: '12:00 PM, Friday, March 4, 2025' },
  { value: 'h:mm a, MMMM d, yyyy', label: '12:00 PM, March 4, 2025' },
  { value: 'h:mm a, MM/dd/yyyy', label: '12:00 PM, 03/04/2025' },
  { value: 'h:mm a, MM/dd', label: '12:00 PM, 03/04' },
  { value: 'h:mm a, MMM d, yy', label: '12:00 PM, Mar 04, 25' },
];

export const DateTimeFormatTypeDropdown = ({ value = GeoDate.defaultFormat, onSelect }: Props) => {
  const [open, setOpen] = useState(false);

  return (
    <DropdownPrimitive.Root open={open} onOpenChange={setOpen}>
      <DropdownPrimitive.Trigger asChild>
        <SquareButton icon={<Check />} isActive={open} />
      </DropdownPrimitive.Trigger>
      <DropdownPrimitive.Content
        align="end"
        sideOffset={2}
        className="z-10 w-[250px] origin-top-right self-end overflow-hidden rounded-lg border border-grey-02 bg-white"
      >
        <DropdownPrimitive.Group className=" overflow-hidden rounded-lg">
          {formatOptions.map((option, index) => (
            <DropdownPrimitive.Item
              key={`triple-type-dropdown-${index}`}
              onClick={() => onSelect(option.value)}
              className={cx(
                'flex w-full select-none items-center justify-between px-3 py-2 text-button text-grey-04 hover:cursor-pointer hover:!bg-bg focus:outline-none aria-disabled:cursor-not-allowed aria-disabled:text-grey-04',
                value === option.value && '!bg-bg !text-text'
              )}
            >
              {option.label}
            </DropdownPrimitive.Item>
          ))}
        </DropdownPrimitive.Group>
      </DropdownPrimitive.Content>
    </DropdownPrimitive.Root>
  );
};
