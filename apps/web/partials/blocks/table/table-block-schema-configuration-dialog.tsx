import { Content, Overlay, Portal, Root, Trigger } from '@radix-ui/react-dialog';
import { motion } from 'framer-motion';

import * as React from 'react';

const MotionContent = motion(Content);
const MotionOverlay = motion(Overlay);

interface Props {
  trigger: React.ReactNode;
  content: React.ReactNode;
}

export function TableBlockSchemaConfigurationDialog(props: Props) {
  return (
    <Root>
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
          transition={{ type: 'tween', ease: 'easeInOut', duration: 0.15 }}
          className="fixed inset-0 top-[25%] z-100 mx-auto h-[484px] max-w-[376px] overflow-hidden overflow-y-auto rounded-lg bg-white focus:outline-none"
        >
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }}>
            {props.content}
          </motion.div>
        </MotionContent>
      </Portal>
    </Root>
  );
}
