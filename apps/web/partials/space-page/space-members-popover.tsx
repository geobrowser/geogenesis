'use client';

import { Content, Root, Trigger } from '@radix-ui/react-popover';

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
      <Content
        key="space-editor-modal-content"
        side="top"
        sideOffset={8}
        avoidCollisions
        className="z-100 origin-bottom"
      >
        {content}
      </Content>
    </Root>
  );
}
