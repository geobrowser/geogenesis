'use client';

import * as Popover from '@radix-ui/react-popover';
import cx from 'classnames';
import { AnimatePresence, motion } from 'framer-motion';

import * as React from 'react';

import { Close } from '~/design-system/icons/close';
import { Context } from '~/design-system/icons/context';

type PopoverMenuProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  menu: React.ReactNode;
  position?: Position;
};

type Position = 'top' | 'bottom' | 'left' | 'right';

export const PopoverMenu = ({ isOpen, onOpenChange, menu = <></>, position = 'bottom' }: PopoverMenuProps) => {
  return (
    <Popover.Root open={isOpen} onOpenChange={onOpenChange}>
      <Popover.Anchor asChild>
        <div onClick={() => onOpenChange(true)} onMouseEnter={() => onOpenChange(true)}>
          {!isOpen ? <Context /> : <Close />}
        </div>
      </Popover.Anchor>
      <Popover.Portal>
        <AnimatePresence mode="popLayout">
          {isOpen && (
            <MotionPopoverContent
              className={cx(
                'relative z-10 rounded border border-grey-02 bg-white p-1 text-white shadow-button focus:outline-none',
                positionClassName[position]
              )}
              side={position}
              align="center"
              alignOffset={0}
              sideOffset={4}
              initial={{ opacity: 0, scale: 0.95, y: -10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -10 }}
              transition={{
                type: 'spring',
                duration: 0.15,
                bounce: 0,
              }}
            >
              <div className="inline-flex items-center gap-1">{menu}</div>
            </MotionPopoverContent>
          )}
        </AnimatePresence>
      </Popover.Portal>
    </Popover.Root>
  );
};

const MotionPopoverContent = motion(Popover.Content);

const positionClassName: Record<Position, string> = {
  top: 'origin-bottom',
  bottom: 'origin-top',
  left: 'origin-right',
  right: 'origin-left',
};
