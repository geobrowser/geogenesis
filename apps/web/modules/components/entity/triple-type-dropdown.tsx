import * as React from 'react';
import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import * as DropdownPrimitive from '@radix-ui/react-dropdown-menu';

const MotionContent = motion(DropdownPrimitive.Content);

interface Props {
  value: React.ReactNode;
  options: { label: React.ReactNode; onClick: () => void; disabled: boolean }[];
}

export const TripleTypeDropdown = ({ value, options }: Props) => {
  // Using a controlled state to enable exit animations with framer-motion
  const [open, setOpen] = useState(false);

  return (
    <DropdownPrimitive.Root onOpenChange={setOpen}>
      <DropdownPrimitive.Trigger className="inline-flex flex-1 items-center justify-between whitespace-nowrap rounded bg-white text-button text-text hover:shadow-inner-text focus:shadow-inner-lg-text [&[data-placeholder]]:text-text">
        {value}
      </DropdownPrimitive.Trigger>
      <AnimatePresence>
        {open && (
          <MotionContent
            forceMount={true} // We force mounting so we can control exit animations through framer-motion
            initial={{ opacity: 0, y: -10 }}
            exit={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.1,
              ease: 'easeInOut',
            }}
            align="end"
            sideOffset={2}
            className="z-10 w-[160px] self-end overflow-hidden rounded border border-grey-02 bg-white"
          >
            <DropdownPrimitive.Group className="overflow-hidden rounded">
              {options.map((option, index) => (
                <DropdownPrimitive.Item
                  key={`triple-type-dropdown-${index}`}
                  onClick={option.disabled ? undefined : option.onClick}
                  className="flex select-none items-center justify-between py-2 px-3 text-button text-grey-04 last:border-b last:border-b-grey-02 aria-disabled:cursor-not-allowed aria-disabled:text-grey-04 [&[data-highlighted]]:bg-bg [&[data-highlighted]]:text-text"
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
