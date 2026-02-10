'use client';

import { Content, Portal, Root, Trigger } from '@radix-ui/react-popover';

import * as React from 'react';

interface Props {
  trigger: React.ReactNode;
  content: React.ReactNode;
}

export function SpaceMembersPopover({ trigger, content }: Props) {
  const [open, setOpen] = React.useState(false);

  return (
    <Root open={open} onOpenChange={setOpen}>
      <Trigger>{trigger}</Trigger>
      <Portal>
        <Content
          key="space-editor-modal-content"
          side="bottom"
          align="start"
          sideOffset={8}
          avoidCollisions
          className="z-100 origin-top-left"
        >
          {content}
        </Content>
      </Portal>
    </Root>
  );
}
