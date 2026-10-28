'use client';

import { Close, Content, Overlay, Portal, Root, Title, Trigger } from '@radix-ui/react-dialog';

import type * as React from 'react';

import { Z_LAYER_CLASS } from '~/core/z-layers';

import { CloseSmall } from '~/design-system/icons/close-small';

/**
 * A modal bottom sheet for a phone menu (Radix Dialog: focus trap, Escape and outside tap close).
 * It can't be dragged, so it has no grab handle.
 */
export function BottomSheet({
  open,
  onOpenChange,
  trigger,
  title,
  showTitle = false,
  headerAction,
  container,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Optional: a sheet opened from elsewhere has no trigger of its own. */
  trigger?: React.ReactNode;
  /** The sheet's accessible name. */
  title: string;
  /** Draws the title as the sheet's heading, with a Close beside it, rather than for screen readers only. */
  showTitle?: boolean;
  /** In the shown title's row in place of Close, e.g. a Filters sheet's Clear all. */
  headerAction?: React.ReactNode;
  /**
   * Where to portal to, for a sheet opened inside another modal surface (the debates panel's own
   * sheet, which traps focus): portaled to the body, the sheet would sit outside that trap.
   */
  container?: HTMLElement | null;
  children: React.ReactNode;
}) {
  return (
    <Root open={open} onOpenChange={onOpenChange}>
      {trigger ? <Trigger asChild>{trigger}</Trigger> : null}
      <Portal container={container ?? undefined}>
        {/* `data-no-sheet-drag` on both: portaled into another sheet (the debates panel's Filters,
            GEO-3463), they sit inside its surface in the DOM, and its native touch listeners would
            otherwise take a swipe here, or on this backdrop, as a drag that moves or dismisses it. */}
        <Overlay data-no-sheet-drag className={`fixed inset-0 ${Z_LAYER_CLASS.bottomSheetBackdrop} bg-text/40`} />
        {/* Portaled into another sheet, `fixed` is placed against that sheet, not the viewport: the
            debates panel's surface is transformed, which makes it the containing block. So the cap is
            that sheet's height (`max-h-full`); 85dvh of the screen is taller than a panel at peek, and
            its overflow-hidden would clip the title and Clear all off the top with no way to scroll
            to them. */}
        {/* `aria-modal` said outright, as Radix does not set it: a surface underneath that steps aside
            for a modal dialog (the debates panel's Escape handler) can only tell from this. */}
        <Content
          data-no-sheet-drag
          aria-modal="true"
          aria-describedby={undefined}
          className={`fixed inset-x-0 bottom-0 ${Z_LAYER_CLASS.bottomSheet} rounded-t-2xl flex ${container ? 'max-h-full' : 'max-h-[85dvh]'} flex-col overflow-y-auto overscroll-contain bg-white px-4 pt-4 pb-[max(1.75rem,env(safe-area-inset-bottom))] focus:outline-hidden`}
          data-testid="bottom-sheet"
        >
          {showTitle ? (
            <div className="mb-3.5 flex items-center justify-between">
              <Title className="text-smallTitle text-text">{title}</Title>
              {headerAction ?? (
                <Close
                  aria-label={`Close ${title.toLowerCase()}`}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-grey-04 hover:bg-grey-01"
                >
                  <CloseSmall />
                </Close>
              )}
            </div>
          ) : (
            <Title className="sr-only">{title}</Title>
          )}
          {children}
        </Content>
      </Portal>
    </Root>
  );
}
