import * as React from 'react';
import { useState } from 'react';
import * as DropdownPrimitive from '@radix-ui/react-dropdown-menu';
import { AnimatePresence, motion } from 'framer-motion';

import { ChevronDownSmall } from './icons/chevron-down-small';
import { Spacer } from './spacer';
import { Text } from './text';
import { cva } from 'class-variance-authority';

const MotionContent = motion(DropdownPrimitive.Content);

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
    <DropdownPrimitive.Root onOpenChange={setOpen}>
      <span className="shadow-button">
        <DropdownPrimitive.Trigger className="flex flex-grow items-center justify-between whitespace-nowrap rounded bg-white px-3 py-2 text-button text-text shadow-inner-grey-02 hover:shadow-inner-text focus:shadow-inner-lg-text [&[data-placeholder]]:text-text">
          {trigger}
          <Spacer width={8} />
          <ChevronDownSmall color="ctaPrimary" />
        </DropdownPrimitive.Trigger>
      </span>
      <AnimatePresence>
        {open && (
          <MotionContent
            forceMount // We force mounting so we can control exit animations through framer-motion
            initial={{ opacity: 0, scale: 0.95, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            transition={{
              duration: 0.1,
              ease: 'easeInOut',
            }}
            align={align}
            sideOffset={2}
            className={contentStyles({ align })}
          >
            <DropdownPrimitive.Group className="overflow-hidden">
              {options.map((option, index) => (
                <DropdownPrimitive.Item
                  key={`dropdown-item-${index}`}
                  disabled={option.disabled}
                  onClick={option.onClick}
                  className="flex cursor-pointer select-none items-center justify-between border-b border-b-grey-02 py-2 px-3 text-button text-grey-04 last:border-none hover:bg-bg hover:text-text hover:outline-none aria-disabled:cursor-not-allowed aria-disabled:text-grey-04"
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
          </MotionContent>
        )}
      </AnimatePresence>
    </DropdownPrimitive.Root>
  );
};
