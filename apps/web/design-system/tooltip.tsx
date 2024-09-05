'use client';

import { Arrow, Content, Provider, Root, Trigger } from '@radix-ui/react-tooltip';
import cx from 'classnames';
import { AnimatePresence, motion } from 'framer-motion';

import { useState } from 'react';
import type { ReactNode } from 'react';

type TooltipProps = {
  trigger: ReactNode;
  label: ReactNode;
  position?: Position;
  className?: string;
};

type Position = 'top' | 'bottom' | 'left' | 'right';

export const Tooltip = ({ trigger, label = '', position = 'bottom', className = '' }: TooltipProps) => {
  const [isOpen, setIsOpen] = useState<boolean>(false);

  return (
    <Provider delayDuration={300} skipDelayDuration={300}>
      <Root open={isOpen} onOpenChange={setIsOpen}>
        <Trigger className={className}>{trigger}</Trigger>
        <AnimatePresence mode="popLayout">
          {isOpen && (
            // a combined <MotionContent> component made with motion(Content) breaks the tooltip behavior
            <Content side={position} align="center" alignOffset={0} sideOffset={8} forceMount>
              <motion.div
                className={cx(
                  'relative w-full max-w-[192px] rounded bg-text p-2 text-white shadow-button focus:outline-none',
                  positionClassName[position]
                )}
                initial={{ opacity: 0, scale: 0.95, y: -10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -10 }}
                transition={{
                  type: 'spring',
                  duration: 0.15,
                  bounce: 0,
                }}
              >
                <Arrow />
                <div className="text-center text-breadcrumb">{label}</div>
              </motion.div>
            </Content>
          )}
        </AnimatePresence>
      </Root>
    </Provider>
  );
};

const positionClassName: Record<Position, string> = {
  top: 'origin-bottom',
  bottom: 'origin-top',
  left: 'origin-right',
  right: 'origin-left',
};
