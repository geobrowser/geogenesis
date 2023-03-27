import * as PopoverPrimitive from '@radix-ui/react-popover';
import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';

import { ChevronDownSmall } from '~/modules/design-system/icons/chevron-down-small';
import { SelectedEntityType, useEntityTable } from '~/modules/entity';
import { Spacer } from '../../design-system/spacer';
import { TypeDialog } from './type-dialog';

const MotionContent = motion(PopoverPrimitive.Content);

interface Props {
  inputContainerWidth: number;
  spaceId: string;
}

export function TypeDialogPopover({ inputContainerWidth, spaceId }: Props) {
  const entityTableStore = useEntityTable();

  // Using a controlled state to enable exit animations with framer-motion
  const [open, setOpen] = useState(false);

  const handleSelect = (type: SelectedEntityType) => {
    setOpen(false);
    entityTableStore.setSelectedType(type);
  };

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>
        <button
          className="flex w-[230px] flex-none items-center justify-between whitespace-pre rounded bg-white py-2 px-3 text-button text-text shadow-inner-grey-02 placeholder-shown:text-text hover:cursor-pointer hover:shadow-inner-text focus:shadow-inner-lg-text focus:outline-none"
          aria-label="type-filter-dropdown"
        >
          {entityTableStore.selectedType?.entityName || 'No Types Found'}
          <Spacer width={8} />
          <ChevronDownSmall color="ctaPrimary" />
        </button>
      </PopoverPrimitive.Trigger>
      <AnimatePresence mode="wait">
        {open ? (
          <MotionContent
            forceMount={true} // We force mounting so we can control exit animations through framer-motion
            initial={{ opacity: 0, y: -10 }}
            exit={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.1,
              ease: 'easeInOut',
            }}
            className="z-100 w-full self-start rounded border border-grey-02 bg-white shadow-button md:mx-auto md:w-[98vw]"
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
