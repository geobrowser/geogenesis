import * as DropdownPrimitive from '@radix-ui/react-dropdown-menu';
import cx from 'classnames';
import { AnimatePresence, motion } from 'framer-motion';
import * as React from 'react';
import { useState } from 'react';

import { SquareButton } from '~/modules/design-system/button';
import type { IconName } from '~/modules/design-system/icon';

const MotionContent = motion(DropdownPrimitive.Content);

interface Props {
  value: IconName;
  options: { value: IconName; label: React.ReactNode; onClick: () => void; disabled: boolean }[];
}

export const TripleTypeDropdown = ({ value, options }: Props) => {
  // Using a controlled state to enable exit animations with framer-motion
  const [open, setOpen] = useState(false);

  return (
    <DropdownPrimitive.Root open={open} onOpenChange={setOpen}>
      <DropdownPrimitive.Trigger className="inline-flex flex-1 items-center justify-between">
        <SquareButton icon={value} isActive={open} />
      </DropdownPrimitive.Trigger>
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
            align="end"
            sideOffset={2}
            className="z-10 w-[160px] origin-top-right self-end overflow-hidden rounded border border-grey-02 bg-white"
          >
            <DropdownPrimitive.Group className="overflow-hidden rounded">
              {options.map((option, index) => (
                <DropdownPrimitive.Item
                  key={`triple-type-dropdown-${index}`}
                  onClick={option.disabled ? undefined : option.onClick}
                  className={cx(
                    'flex select-none items-center justify-between py-2 px-3 text-button text-grey-04 last:border-b last:border-b-grey-02 hover:!bg-bg focus:outline-none aria-disabled:cursor-not-allowed aria-disabled:text-grey-04',
                    value === option.value && '!bg-bg !text-text'
                  )}
                >
                  {option.label}
                </DropdownPrimitive.Item>
              ))}
            </DropdownPrimitive.Group>
          </MotionContent>
        )}
      </AnimatePresence>
    </DropdownPrimitive.Root>
  );
};
