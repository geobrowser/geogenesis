'use client';

import { Arrow, Content, Portal, Provider, Root, Trigger } from '@radix-ui/react-tooltip';

import { useState } from 'react';
import type { ReactNode } from 'react';

import cx from 'classnames';
import { AnimatePresence, motion } from 'framer-motion';

type TooltipProps = {
  trigger: ReactNode;
  label: ReactNode;
  position?: Position;
  align?: Align;
  variant?: Variant;
  /** Also opens on a touch press. Intended for read-only triggers that have no separate action. */
  openOnPress?: boolean;
};

type Position = 'top' | 'bottom' | 'left' | 'right';

type Align = 'start' | 'center' | 'end';

type Variant = 'light' | 'dark' | 'propertyDescription';

export const Tooltip = ({
  trigger,
  label = '',
  position = 'bottom',
  align = 'center',
  variant = 'dark',
  openOnPress = false,
}: TooltipProps) => {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [x, y] = originCoordinates[position];

  return (
    <Provider delayDuration={300} skipDelayDuration={300}>
      <Root open={isOpen} onOpenChange={setIsOpen}>
        <Trigger
          asChild
          onPointerDown={
            openOnPress
              ? event => {
                  if (event.pointerType !== 'touch') return;

                  // Radix deliberately ignores touch pointers for tooltips. This opt-in path is
                  // for read-only triggers whose explanation would otherwise be unreachable on a
                  // touchscreen. Preventing the default also skips Radix's close-on-pointer-down.
                  event.preventDefault();
                  setIsOpen(open => !open);
                }
              : undefined
          }
          // Radix closes a tooltip on click. Keep a touch-opened, read-only tooltip visible until
          // the next press or an outside interaction dismisses it.
          onClick={openOnPress ? event => event.preventDefault() : undefined}
        >
          {trigger}
        </Trigger>
        <Portal>
          <AnimatePresence mode="popLayout">
            {isOpen && (
              // a combined <MotionContent> component made with motion(Content) breaks the tooltip behavior
              <Content side={position} align={align} alignOffset={0} sideOffset={4} forceMount className="z-1001">
                <motion.div
                  className={cx(
                    'relative w-full focus:outline-hidden',
                    positionClassName[position],
                    variantClassName[variant]
                  )}
                  initial={{ opacity: 0, scale: 0.95, x, y }}
                  animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, x, y }}
                  transition={{
                    type: 'spring',
                    duration: 0.15,
                    bounce: 0,
                  }}
                >
                  {variant === 'dark' && <Arrow />}
                  <div className={labelClassName[variant]}>{label}</div>
                </motion.div>
              </Content>
            )}
          </AnimatePresence>
        </Portal>
      </Root>
    </Provider>
  );
};

const originCoordinates: Record<Position, [number, number]> = {
  top: [0, 10],
  bottom: [0, -10],
  left: [10, 0],
  right: [-10, 0],
};

const positionClassName: Record<Position, string> = {
  top: 'origin-bottom',
  bottom: 'origin-top',
  left: 'origin-right',
  right: 'origin-left',
};

const variantClassName: Record<Variant, string> = {
  light: 'bg-white text-text max-w-[250px] rounded p-3 shadow-lg text-metadata',
  dark: 'bg-text text-white max-w-[192px] rounded p-2 text-center text-breadcrumb',
  propertyDescription:
    'w-[350px] max-w-[min(700px,calc(100vw-32px))] overflow-hidden rounded-lg border border-grey-02 bg-white p-3 text-metadata text-text shadow-[0px_8px_25px_0px_rgba(0,0,0,0.09)]',
};

const labelClassName: Record<Variant, string> = {
  light: '',
  dark: '',
  propertyDescription: 'line-clamp-3 break-words',
};
