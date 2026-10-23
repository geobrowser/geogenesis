'use client';

import { Content, Overlay, Portal, Root, Title } from '@radix-ui/react-dialog';

import * as React from 'react';

import { ElevatedPopoverPortalContext } from '~/design-system/use-elevated-popover-portal';

/** Slide-up sheet for the Chat/People panels on narrow viewports — the 320px inline sidebar doesn't fit. */
export function MobileSidebarSheet({
  open,
  onOpenChange,
  title,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: React.ReactNode;
}) {
  const [popoverContainer, setPopoverContainer] = React.useState<HTMLDivElement | null>(null);

  return (
    <Root open={open} onOpenChange={onOpenChange}>
      <Portal>
        <Overlay className="fixed inset-0 z-100 bg-text/20" />
        <Content className="fixed inset-x-0 bottom-0 z-101 flex max-h-[80vh] flex-col overflow-hidden rounded-t-lg bg-white focus:outline-hidden">
          <Title className="sr-only">{title}</Title>
          <ElevatedPopoverPortalContext.Provider value={popoverContainer}>
            {children}
          </ElevatedPopoverPortalContext.Provider>
          <div ref={setPopoverContainer} />
        </Content>
      </Portal>
    </Root>
  );
}
