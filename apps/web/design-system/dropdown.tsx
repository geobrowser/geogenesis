'use client';

import * as DropdownPrimitive from '@radix-ui/react-dropdown-menu';

import * as React from 'react';
import { useState } from 'react';

import { cva } from 'class-variance-authority';
import cx from 'classnames';

import { ChevronDownSmall } from './icons/chevron-down-small';
import { Spacer } from './spacer';
import { Text } from './text';

interface Props {
  trigger: React.ReactNode;
  align?: 'end' | 'center' | 'start';
  /** When true, the menu scrolls vertically after ~22rem / 65vh so long option lists stay usable. */
  scrollableList?: boolean;
  options: { label: React.ReactNode; sublabel?: string; value: string; disabled: boolean; onClick: () => void }[];
}

const contentStyles = cva(
  'z-10 w-[273px] rounded border border-grey-02 bg-white shadow-lg',
  {
    variants: {
      align: {
        start: 'origin-top-left',
        center: 'origin-top',
        end: 'origin-top-right',
      },
      scroll: {
        true: 'max-h-[min(22rem,65vh)] overflow-y-auto overflow-x-hidden',
        false: 'overflow-hidden',
      },
    },
    defaultVariants: {
      scroll: false,
    },
  }
);

export const Dropdown = ({ trigger, align = 'end', scrollableList = false, options }: Props) => {
  // Using a controlled state to enable exit animations with framer-motion
  const [open, setOpen] = useState(false);

  return (
    <DropdownPrimitive.Root open={open} onOpenChange={setOpen}>
      <span className="shadow-button">
        <DropdownPrimitive.Trigger className="flex grow items-center justify-between rounded bg-white px-3 py-2 text-button whitespace-nowrap text-text shadow-inner-grey-02 hover:shadow-inner-text focus:shadow-inner-lg-text data-placeholder:text-text">
          {trigger}
          <Spacer width={8} />
          <ChevronDownSmall color="ctaPrimary" />
        </DropdownPrimitive.Trigger>
      </span>
      <DropdownPrimitive.Content
        align={align}
        sideOffset={2}
        className={contentStyles({ align, scroll: scrollableList })}
      >
        <DropdownPrimitive.Group className={cx(!scrollableList && 'overflow-hidden')}>
          {options.map((option, index) => (
            <DropdownPrimitive.Item
              key={`dropdown-item-${index}`}
              disabled={option.disabled}
              onClick={option.onClick}
              className="flex cursor-pointer items-center justify-between border-b border-b-grey-02 px-3 py-2 text-button text-grey-04 select-none last:border-none hover:bg-bg hover:text-text hover:outline-hidden aria-disabled:cursor-not-allowed aria-disabled:text-grey-04"
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
