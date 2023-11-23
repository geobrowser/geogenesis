'use client';

import * as PopoverPrimitive from '@radix-ui/react-popover';
import { AnimatePresence, motion } from 'framer-motion';

import { useState } from 'react';

import { useEntityTable } from '~/core/state/entity-table-store/entity-table-store';
import { GeoType } from '~/core/types';

import { ChevronDownSmall } from '~/design-system/icons/chevron-down-small';
import { Spacer } from '~/design-system/spacer';

import { TypeDialog } from './type-dialog';

const MotionContent = motion(PopoverPrimitive.Content);

interface Props {
  inputContainerWidth: number;
  spaceId: string;
}

export function TypeDialogPopover({ inputContainerWidth, spaceId }: Props) {
  const { selectedType, setSelectedType } = useEntityTable();

  // Using a controlled state to enable exit animations with framer-motion
  const [open, setOpen] = useState(false);

  const handleSelect = (type: GeoType) => {
    setOpen(false);
    setSelectedType(type);
  };

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>
        <button
          className="flex w-[230px] flex-none items-center justify-between whitespace-pre rounded bg-white px-3 py-2 text-button text-text shadow-inner-grey-02 placeholder-shown:text-text hover:cursor-pointer hover:shadow-inner-text focus:shadow-inner-lg-text focus:outline-none"
          aria-label="type-filter-dropdown"
        >
          {selectedType?.entityName || 'No Types Found'}
          <Spacer width={8} />
          <ChevronDownSmall color="ctaPrimary" />
        </button>
      </PopoverPrimitive.Trigger>
      <AnimatePresence mode="wait">
        {open ? (
          <MotionContent
            forceMount // We force mounting so we can control exit animations through framer-motion
            initial={{ opacity: 0, scale: 0.95, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            transition={{
              duration: 0.1,
              ease: 'easeInOut',
            }}
            className="z-100 w-full origin-top-left self-start rounded border border-grey-02 bg-white shadow-button md:mx-auto md:w-[98vw]"
            style={{ width: `calc(${inputContainerWidth}px / 2)` }}
            align="start"
            sideOffset={8}
          >
            <TypeDialog spaceId={spaceId} handleSelect={handleSelect} />
          </MotionContent>
        ) : null}
      </AnimatePresence>
    </PopoverPrimitive.Root>
  );
}
