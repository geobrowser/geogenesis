'use client';

import { Close, Content, Overlay, Portal, Root, Title, Trigger } from '@radix-ui/react-dialog';

import * as React from 'react';

import { useVisualViewportInset } from '~/core/hooks/use-visual-viewport-inset';
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
  avoidKeyboard = false,
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
  /**
   * For a sheet holding text fields: rides above the on-screen keyboard, keeps the focused field in
   * view and puts the page back where it was on close. Only for a sheet portaled to the body.
   */
  avoidKeyboard?: boolean;
  children: React.ReactNode;
}) {
  const keyboardAware = avoidKeyboard && !container;
  const inset = useVisualViewportInset(keyboardAware && open);
  const contentRef = React.useRef<HTMLDivElement>(null);
  useRestoreScrollOnClose(keyboardAware && open);

  // The keyboard shrinks the sheet, so the focused field can end up below its fold.
  React.useEffect(() => {
    if (!inset || inset.bottom === 0) return;
    const active = document.activeElement;
    if (active instanceof HTMLElement && contentRef.current?.contains(active)) {
      active.scrollIntoView({ block: 'nearest' });
    }
  }, [inset]);

  // The scroll padding keeps a focused field clear of a sticky actions row at the sheet's foot.
  const keyboardStyle: React.CSSProperties | undefined =
    inset && inset.bottom > 0
      ? { bottom: inset.bottom, maxHeight: Math.max(0, inset.height - 12), scrollPaddingBottom: 72 }
      : undefined;

  return (
    <Root open={open} onOpenChange={onOpenChange}>
      {trigger ? <Trigger asChild>{trigger}</Trigger> : null}
      <Portal container={container ?? undefined}>
        {/* `data-no-sheet-drag` on both: portaled into another sheet (the debates panel's Filters,
            GEO-3463), they sit inside its surface in the DOM, and its native touch listeners would
            otherwise take a swipe here, or on this backdrop, as a drag that moves or dismisses it. */}
        <Overlay
          data-no-sheet-drag
          data-bottom-sheet-backdrop
          className={`fixed inset-0 ${Z_LAYER_CLASS.bottomSheetBackdrop} bg-text/40`}
        />
        {/* Portaled into another sheet, `fixed` is placed against that sheet, not the viewport: the
            debates panel's surface is transformed, which makes it the containing block. So the cap is
            that sheet's height (`max-h-full`); 85dvh of the screen is taller than a panel at peek, and
            its overflow-hidden would clip the title and Clear all off the top with no way to scroll
            to them. */}
        {/* `aria-modal` said outright, as Radix does not set it: a surface underneath that steps aside
            for a modal dialog (the debates panel's Escape handler) can only tell from this. */}
        <Content
          ref={contentRef}
          style={keyboardStyle}
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

/**
 * iOS scrolls the page to bring a focused field into view and leaves it there when the keyboard
 * goes away. Puts the page back at the scroll position it had when the sheet opened.
 */
function useRestoreScrollOnClose(active: boolean) {
  // Unmounted with the page (a navigation), the sheet must not scroll the next page.
  const mounted = React.useRef(true);
  React.useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  React.useLayoutEffect(() => {
    if (!active) return;
    const x = window.scrollX;
    const y = window.scrollY;
    return () => {
      // After the keyboard has gone and Radix has returned focus to the trigger.
      requestAnimationFrame(() => {
        if (!mounted.current) return;
        if (window.scrollX !== x || window.scrollY !== y) window.scrollTo(x, y);
      });
    };
  }, [active]);
}
