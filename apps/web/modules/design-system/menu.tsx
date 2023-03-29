import * as React from 'react';

import { PopoverContent, Root, Trigger } from '@radix-ui/react-popover';
import { AnimatePresence, motion } from 'framer-motion';

interface Props {
  children: React.ReactNode;
  trigger: React.ReactNode;
}

const MotionContent = motion(PopoverContent);

export function Menu({ children, trigger }: Props) {
  const [open, setOpen] = React.useState(false);

  // @TODO: accessibility for button focus states
  return (
    <Root onOpenChange={setOpen} open={open}>
      <Trigger>{trigger}</Trigger>
      <AnimatePresence>
        {open && (
          <MotionContent
            forceMount
            initial={{ opacity: 0, scale: 0.95, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            transition={{
              duration: 0.1,
              ease: 'easeInOut',
            }}
            align="end"
            sideOffset={8}
            className="z-10 w-[360px] origin-top-right divide-y divide-grey-02 overflow-hidden rounded border border-grey-02 shadow-lg"
          >
            {children}
          </MotionContent>
        )}
      </AnimatePresence>
    </Root>
  );
}
