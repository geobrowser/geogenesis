'use client';

import * as Popover from '@radix-ui/react-popover';
import cx from 'classnames';
import { AnimatePresence, motion } from 'framer-motion';

import * as React from 'react';
import { useState } from 'react';

type TooltipProps = {
  trigger: React.ReactNode;
  label: React.ReactNode;
  position?: Position;
};

type Position = 'top' | 'bottom' | 'left' | 'right';

export const Tooltip = ({ trigger, label = '', position = 'bottom' }: TooltipProps) => {
  const [isTooltipShown, setIsTooltipShown] = useState(false);

  return (
    <Popover.Root open={isTooltipShown} onOpenChange={setIsTooltipShown}>
      <Popover.Anchor asChild>
        <div onClick={() => setIsTooltipShown(true)} onMouseEnter={() => setIsTooltipShown(true)}>
          {trigger}
        </div>
      </Popover.Anchor>
      <Popover.Portal>
        <AnimatePresence mode="popLayout">
          {isTooltipShown && (
            <MotionPopoverContent
              className={cx(
                'relative z-10 w-full max-w-[192px] rounded bg-text p-2 text-white shadow-button focus:outline-none',
                positionClassName[position]
              )}
              side={position}
              align="center"
              alignOffset={0}
              sideOffset={8}
              initial={{ opacity: 0, scale: 0.95, y: -10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -10 }}
              transition={{
                type: 'spring',
                duration: 0.15,
                bounce: 0,
              }}
            >
              <div className="text-center text-breadcrumb">{label}</div>
              <Popover.Arrow />
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
