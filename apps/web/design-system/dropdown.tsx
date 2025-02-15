'use client';

import * as DropdownPrimitive from '@radix-ui/react-dropdown-menu';
import { cva } from 'class-variance-authority';

import * as React from 'react';
import { useState } from 'react';

import { ChevronDownSmall } from './icons/chevron-down-small';
import { Spacer } from './spacer';
import { Text } from './text';

interface Props {
  trigger: React.ReactNode;
  align?: 'end' | 'center' | 'start';
  options: { label: React.ReactNode; sublabel?: string; value: string; disabled: boolean; onClick: () => void }[];
}

const contentStyles = cva('z-10 w-[273px] overflow-hidden rounded border border-grey-02 bg-white shadow-lg', {
  variants: {
    align: {
      start: 'origin-top-left',
      center: 'origin-top',
      end: 'origin-top-right',
    },
  },
});

export const Dropdown = ({ trigger, align = 'end', options }: Props) => {
  // Using a controlled state to enable exit animations with framer-motion
  const [open, setOpen] = useState(false);

  return (
    <DropdownPrimitive.Root open={open} onOpenChange={setOpen}>
      <span className="shadow-button">
        <DropdownPrimitive.Trigger className="flex flex-grow items-center justify-between whitespace-nowrap rounded bg-white px-3 py-2 text-button text-text shadow-inner-grey-02 hover:shadow-inner-text focus:shadow-inner-lg-text [&[data-placeholder]]:text-text">
          {trigger}
          <Spacer width={8} />
          <ChevronDownSmall color="ctaPrimary" />
        </DropdownPrimitive.Trigger>
      </span>
      <DropdownPrimitive.Content align={align} sideOffset={2} className={contentStyles({ align })}>
        <DropdownPrimitive.Group className="overflow-hidden">
          {options.map((option, index) => (
            <DropdownPrimitive.Item
              key={`dropdown-item-${index}`}
              disabled={option.disabled}
              onClick={option.onClick}
              className="flex cursor-pointer select-none items-center justify-between border-b border-b-grey-02 px-3 py-2 text-button text-grey-04 last:border-none hover:bg-bg hover:text-text hover:outline-none aria-disabled:cursor-not-allowed aria-disabled:text-grey-04"
            >
              {option.label}
              {option.disabled && (
                <Text variant="smallButton" color="grey-04">
                  {option.sublabel}
                </Text>
              )}
            </DropdownPrimitive.Item>
          ))}
        </DropdownPrimitive.Group>
      </DropdownPrimitive.Content>
    </DropdownPrimitive.Root>
  );
};
