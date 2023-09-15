'use client';

import { Content, Root, Trigger } from '@radix-ui/react-popover';
import { AnimatePresence, motion } from 'framer-motion';

import * as React from 'react';

interface Props {
  trigger: React.ReactNode;
  content: React.ReactNode;
}

const MotionContent = motion(Content);

export function SpaceMembersPopover({ trigger, content }: Props) {
  const [open, setOpen] = React.useState(false);

  return (
    <Root open={open} onOpenChange={setOpen}>
      <Trigger>{trigger}</Trigger>
      <AnimatePresence mode="popLayout">
        {open && (
          <MotionContent
            key="space-editor-modal-content"
            side="top"
            sideOffset={8}
            avoidCollisions
            initial={{ opacity: 0, y: 15, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, y: 15, scale: 0.95 }}
            transition={{ type: 'tween', ease: 'easeInOut', duration: 0.15, opacity: { duration: 0.1 } }}
            className="origin-bottom"
          >
            {content}
          </MotionContent>
        )}
      </AnimatePresence>
    </Root>
  );
}
