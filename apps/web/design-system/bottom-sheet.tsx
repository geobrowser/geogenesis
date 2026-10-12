'use client';

import { Content, Overlay, Portal, Root, Title, Trigger } from '@radix-ui/react-dialog';

import type * as React from 'react';

/**
 * A modal sheet that rises from the bottom of a phone screen, for a menu that has no room to drop
 * down. Radix Dialog underneath: focus moves in, Escape and a tap outside close it.
 */
export function BottomSheet({
  open,
  onOpenChange,
  trigger,
  title,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Optional: a sheet opened from elsewhere has no trigger of its own. */
  trigger?: React.ReactNode;
  /** The sheet's accessible name. */
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Root open={open} onOpenChange={onOpenChange}>
      {trigger ? <Trigger asChild>{trigger}</Trigger> : null}
      <Portal>
        <Overlay className="fixed inset-0 z-100 bg-text/40" />
        <Content
          aria-describedby={undefined}
          className="rounded-t-2xl fixed inset-x-0 bottom-0 z-101 flex max-h-[85dvh] flex-col overflow-y-auto overscroll-contain bg-white px-4 pt-2 pb-[max(1.75rem,env(safe-area-inset-bottom))] focus:outline-hidden"
          data-testid="bottom-sheet"
        >
          <span aria-hidden className="mx-auto mb-2 block h-1 w-9 shrink-0 rounded-full bg-grey-02" />
          <Title className="sr-only">{title}</Title>
          {children}
        </Content>
      </Portal>
    </Root>
  );
}
