'use client';

import { Content, Overlay, Portal, Root, Title } from '@radix-ui/react-dialog';

import * as React from 'react';

import { motion } from 'framer-motion';

import { SquareButton } from '~/design-system/button';
import { Close } from '~/design-system/icons/close';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  openerRef: React.RefObject<HTMLButtonElement | null>;
  header: React.ReactNode;
  content: React.ReactNode;
}

export function SpaceMembersManageDialog(props: Props) {
  return (
    <Root open={props.open} onOpenChange={props.onOpenChange}>
      <Portal>
        <Overlay className="fixed inset-0 z-100 bg-text/20" />

        <Content
          onCloseAutoFocus={event => {
            event.preventDefault();
            props.openerRef.current?.focus();
          }}
          className="fixed inset-0 top-[25%] z-100 mx-auto h-[415px] max-w-[586px] overflow-hidden overflow-y-auto rounded bg-white focus:outline-hidden"
        >
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }}>
            <div className="flex flex-col gap-3 p-4">
              <div className="flex items-center justify-between">
                <Title asChild>{props.header}</Title>
                <SquareButton aria-label="Close dialog" onClick={() => props.onOpenChange(false)} icon={<Close />} />
              </div>

              {props.content}
            </div>
          </motion.div>
        </Content>
      </Portal>
    </Root>
  );
}
