'use client';

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
  sideOffset?: number;
  className?: string;
  asChild?: boolean;
  modal?: boolean;
}

const MotionContent = motion(PopoverContent);

const contentStyles = cva(
  'z-10 w-[360px] divide-y divide-grey-02 overflow-hidden rounded-lg border border-grey-02 shadow-lg',
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
  side,
  sideOffset = 8,
  align = 'end',
  asChild = false,
  className = '',
  modal = false,
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
            sideOffset={sideOffset}
            className={contentStyles({ align, className })}
          >
            {children}
          </MotionContent>
        )}
      </AnimatePresence>
    </Root>
  );
}

export function MenuItem({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-button text-grey-04 transition-colors duration-75 hover:bg-bg hover:text-text focus:bg-bg focus:text-text">
      {children}
    </div>
  );
}
