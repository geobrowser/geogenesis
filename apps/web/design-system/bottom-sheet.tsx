'use client';

import { Content, Overlay, Portal, Root, Title, Trigger } from '@radix-ui/react-dialog';

import type * as React from 'react';

import { Z_LAYER_CLASS } from '~/core/z-layers';

/**
 * A modal bottom sheet for a phone menu (Radix Dialog: focus trap, Escape and outside tap close).
 * It can't be dragged, so it has no grab handle.
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
        <Overlay className={`fixed inset-0 ${Z_LAYER_CLASS.bottomSheetBackdrop} bg-text/40`} />
        <Content
          aria-describedby={undefined}
          className={`fixed inset-x-0 bottom-0 ${Z_LAYER_CLASS.bottomSheet} rounded-t-2xl flex max-h-[85dvh] flex-col overflow-y-auto overscroll-contain bg-white px-4 pt-4 pb-[max(1.75rem,env(safe-area-inset-bottom))] focus:outline-hidden`}
          data-testid="bottom-sheet"
        >
          <Title className="sr-only">{title}</Title>
          {children}
        </Content>
      </Portal>
    </Root>
  );
}
