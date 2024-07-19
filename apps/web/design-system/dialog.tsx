'use client';

import { Content, Overlay, Portal, Root, Trigger } from '@radix-ui/react-dialog';
import { motion } from 'framer-motion';

import * as React from 'react';

import { SquareButton } from '~/design-system/button';
import { Close } from '~/design-system/icons/close';

const MotionContent = motion(Content);
const MotionOverlay = motion(Overlay);

interface Props {
  trigger: React.ReactNode;
  header: React.ReactNode;
  content: React.ReactNode;
}

export function Dialog(props: Props) {
  const [open, onOpenChange] = React.useState(false);

  return (
    <Root open={open} onOpenChange={onOpenChange}>
      <Trigger className="w-full">{props.trigger}</Trigger>

      <Portal>
        <MotionOverlay
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.2 }}
          transition={{ type: 'tween', ease: 'easeInOut', duration: 0.15, opacity: { duration: 0.1 } }}
          className="fixed inset-0 z-100 bg-text"
        />

        <MotionContent
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ type: 'spring', bounce: 0, duration: 0.15 }}
          className="fixed inset-0 z-[101] flex items-start justify-center focus:outline-none"
        >
          <div className="mt-40 inline-flex max-h-[415px] max-w-[586px] flex-col gap-3 overflow-y-auto rounded-lg bg-white p-4">
            <div className="flex items-center justify-between">
              {props.header}
              <SquareButton onClick={() => onOpenChange(false)} icon={<Close />} />
            </div>

            {props.content}
          </div>
        </MotionContent>
      </Portal>
    </Root>
  );
}
