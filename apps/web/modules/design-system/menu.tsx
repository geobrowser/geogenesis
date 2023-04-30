import * as React from 'react';

import { PopoverContent, Root, Trigger } from '@radix-ui/react-popover';
import { AnimatePresence, motion } from 'framer-motion';
import { cva } from 'class-variance-authority';

interface Props {
  children: React.ReactNode;
  trigger: React.ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  align?: 'start' | 'center' | 'end';
  className?: string;
}

const MotionContent = motion(PopoverContent);

const contentStyles = cva(
  'z-10 w-[360px] divide-y divide-grey-02 overflow-hidden rounded border border-grey-02 shadow-lg',
  {
    variants: {
      align: {
        start: 'origin-top-left',
        center: 'origin-top',
        end: 'origin-top-right',
      },
    },
  }
);

export function Menu({ children, trigger, open, onOpenChange, align = 'end', className = '' }: Props) {
  // @TODO: accessibility for button focus states
  return (
    <Root onOpenChange={onOpenChange} open={open}>
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
            align={align}
            sideOffset={8}
            className={contentStyles({ align, className })}
          >
            {children}
          </MotionContent>
        )}
      </AnimatePresence>
    </Root>
  );
}
