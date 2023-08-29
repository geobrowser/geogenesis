import { PopoverContent, Root, Trigger } from '@radix-ui/react-popover';
import { cva } from 'class-variance-authority';
import { AnimatePresence, motion } from 'framer-motion';

import * as React from 'react';

interface Props {
  children: React.ReactNode;
  trigger: React.ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  align?: 'start' | 'center' | 'end';
  side?: 'bottom' | 'left' | 'right' | 'top';
  className?: string;
  asChild?: boolean;
  modal?: boolean
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

export function Menu({
  children,
  trigger,
  open,
  onOpenChange,
  align = 'end',
  side = undefined,
  asChild = false,
  className = '',
  modal = false
}: Props) {
  // @TODO: accessibility for button focus states
  return (
    <Root onOpenChange={onOpenChange} open={open} modal={modal}>
      <Trigger asChild={asChild}>{trigger}</Trigger>
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
            side={side}
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
