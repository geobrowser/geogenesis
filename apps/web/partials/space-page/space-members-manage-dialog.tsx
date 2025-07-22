'use client';

import { Content, Overlay, Portal, Root, Trigger } from '@radix-ui/react-dialog';
import { motion } from 'framer-motion';

import * as React from 'react';

import { SquareButton } from '~/design-system/button';
import { Close } from '~/design-system/icons/close';

interface Props {
  trigger: React.ReactNode;
  header: React.ReactNode;
  content: React.ReactNode;
}

export function SpaceMembersManageDialog(props: Props) {
  const [open, onOpenChange] = React.useState(false);

  return (
    <Root open={open} onOpenChange={onOpenChange}>
      <Trigger className="w-full">{props.trigger}</Trigger>

      <Portal>
        <Overlay className="fixed inset-0 z-100 bg-text bg-opacity-20" />

        <Content className="fixed inset-0 top-[25%] z-100 mx-auto h-[415px] max-w-[586px] overflow-hidden overflow-y-auto rounded bg-white focus:outline-none">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }}>
            <div className="flex flex-col gap-3 p-4">
              <div className="flex items-center justify-between">
                {props.header}
                <SquareButton onClick={() => onOpenChange(false)} icon={<Close />} />
              </div>

              {props.content}
            </div>
          </motion.div>
        </Content>
      </Portal>
    </Root>
  );
}
