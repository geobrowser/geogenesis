'use client';

import * as DropdownPrimitive from '@radix-ui/react-dropdown-menu';
import cx from 'classnames';
import { AnimatePresence, motion } from 'framer-motion';

import * as React from 'react';
import { useState } from 'react';

import { TripleValueType } from '~/core/types';

import { SquareButton } from '~/design-system/button';
import { Date } from '~/design-system/icons/date';
import { Image } from '~/design-system/icons/image';
import { Relation } from '~/design-system/icons/relation';
import { Text } from '~/design-system/icons/text';
import { Url } from '~/design-system/icons/url';
import { ColorName } from '~/design-system/theme/colors';

const MotionContent = motion(DropdownPrimitive.Content);

const icons: Record<TripleValueType, React.FunctionComponent<{ color?: ColorName }>> = {
  date: Date,
  entity: Relation,
  string: Text,
  number: Text,
  image: Image,
  url: Url,
};

interface Props {
  value: TripleValueType;
  options: { value: TripleValueType; label: React.ReactNode; onClick: () => void; disabled: boolean }[];
}

export const TripleTypeDropdown = ({ value, options }: Props) => {
  // Using a controlled state to enable exit animations with framer-motion
  const [open, setOpen] = useState(false);

  const Icon = icons[value];

  return (
    <DropdownPrimitive.Root open={open} onOpenChange={setOpen}>
      <DropdownPrimitive.Trigger className="inline-flex flex-1 items-center justify-between">
        <SquareButton icon={<Icon />} isActive={open} />
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
            className="z-10 w-[160px] origin-top-right self-end overflow-hidden rounded-lg border border-grey-02 bg-white"
          >
            <DropdownPrimitive.Group className="divide-y divide-grey-02 overflow-hidden rounded-lg">
              {options.map((option, index) => (
                <DropdownPrimitive.Item
                  key={`triple-type-dropdown-${index}`}
                  onClick={option.disabled ? undefined : option.onClick}
                  className={cx(
                    'flex w-full select-none items-center justify-between px-3 py-2 text-button text-grey-04 last:border-b last:border-b-grey-02 hover:cursor-pointer hover:!bg-bg focus:outline-none aria-disabled:cursor-not-allowed aria-disabled:text-grey-04',
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
