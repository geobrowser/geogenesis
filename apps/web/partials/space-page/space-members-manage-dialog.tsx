'use client';

import { Content, Overlay, Portal, Root, Title, Trigger } from '@radix-ui/react-dialog';
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
      <Trigger className="group relative flex w-full items-center bg-white px-3 py-[10px] text-button text-text">
        <div className="absolute inset-1 z-0 rounded transition-colors duration-75 group-hover:bg-grey-01" />
        <div className="relative z-10 flex w-full items-center gap-2">{props.trigger}</div>
      </Trigger>

      <Portal>
        <Overlay className="fixed inset-0 z-100 bg-text/20" />

        <Content className="fixed inset-0 top-[25%] z-100 mx-auto h-[415px] max-w-[586px] overflow-hidden overflow-y-auto rounded bg-white focus:outline-hidden">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }}>
            <div className="flex flex-col gap-3 p-4">
              <div className="flex items-center justify-between">
                <Title asChild>{props.header}</Title>
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
