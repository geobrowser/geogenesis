import * as PopoverPrimitive from '@radix-ui/react-popover';
import { Editor } from '@tiptap/react';
import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';

import { SquareButton } from '~/modules/design-system/button';
import { Triple } from '~/modules/types';
import { commandItems } from './command-items';
import { CommandList } from './command-list';

const MotionContent = motion(PopoverPrimitive.Content);

interface Props {
  editor: Editor;
  spaceId: string;
  initialTypes: Triple[];
}

export function CommandListPopover({ editor, spaceId, initialTypes }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>
        <SquareButton icon="plus" />
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
            style={{ width: `300` }}
            align="start"
            sideOffset={8}
          >
            <CommandList
              editor={editor}
              items={commandItems}
              initialTypes={initialTypes}
              spaceId={spaceId}
              variant="button"
            />
          </MotionContent>
        ) : null}
      </AnimatePresence>
    </PopoverPrimitive.Root>
  );
}
