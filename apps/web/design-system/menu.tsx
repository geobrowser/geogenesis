'use client';

import { PopoverContent, Root, Trigger } from '@radix-ui/react-popover';

import * as React from 'react';

import { cva } from 'class-variance-authority';
import cx from 'classnames';

import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { useAdaptiveDropdownPlacement } from '~/design-system/use-adaptive-dropdown-placement';

interface Props {
  children: React.ReactNode;
  trigger: React.ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sideOffset?: number;
  className?: string;
  /** Override the inner scroll viewport classes (e.g., to set a different max height). */
  viewportClassName?: string;
  asChild?: boolean;
  modal?: boolean;
}

/**
 * Outer shell: opaque + clips corners so overscroll never reveals “holes” behind the panel.
 * `overscroll-contain` here keeps the page from scrolling when the wheel lands on the
 * shell border/non-overflowing menus — without us needing a non-passive React wheel
 * listener (which would force main-thread scrolling and feel jittery).
 */
const shellStyles = cva(
  'z-100 w-full max-w-[360px] min-w-0 overflow-hidden overscroll-contain rounded-lg border border-grey-02 bg-white shadow-lg outline-none focus:outline-none focus-visible:outline-none isolate',
  {
  variants: {
    align: {
      start: 'origin-top-left',
      center: 'origin-top',
      end: 'origin-top-right',
    },
  },
});

// 200px capped scrolling at ~5 items, so an 8-item menu had ~120px of scroll range.
// That tiny range made each wheel tick feel like a big jump even when the underlying
// scroll was smooth. Default to a height that fits ~10 items, capped at 75vh on small
// screens. Callers that want a smaller scroll well can still pass `viewportClassName`.
const defaultScrollViewportClass =
  'w-full max-h-[min(400px,75vh)] min-h-0 min-w-0 overflow-y-auto overscroll-contain scroll-smooth bg-white [background-clip:padding-box]';

export function Menu({
  children,
  trigger,
  open,
  onOpenChange,
  sideOffset = 8,
  asChild = false,
  className = '',
  viewportClassName,
  modal = false,
}: Props) {
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const { align: adaptiveAlign, side: adaptiveSide } = useAdaptiveDropdownPlacement(triggerRef, {
    isOpen: open,
    preferredHeight: 240,
    gap: 8,
  });

  // @TODO: accessibility for button focus states
  return (
    <Root onOpenChange={onOpenChange} open={open} modal={modal}>
      <Trigger ref={triggerRef} asChild={asChild} suppressHydrationWarning>
        {trigger}
      </Trigger>
      <PopoverContent
        align={adaptiveAlign}
        side={adaptiveSide}
        sideOffset={sideOffset}
        avoidCollisions={true}
        collisionPadding={8}
        className={cx(shellStyles({ align: adaptiveAlign }), className)}
      >
        <div className={viewportClassName ?? defaultScrollViewportClass}>
          {children}
        </div>
      </PopoverContent>
    </Root>
  );
}

type MenuItemProps = {
  active?: boolean;
  href?: string;
  onClick?: () => void;
  children: React.ReactNode;
  className?: string;
};

export function MenuItem({ className = '', active = false, children, href, ...rest }: MenuItemProps) {
  if (href) {
    return (
      <Link
        href={href}
        className={cx('group relative flex w-full items-center bg-white px-3 py-2.5 text-button text-text', className)}
        {...rest}
      >
        <div
          className={cx(
            'absolute inset-1 z-0 rounded',
            active ? 'bg-grey-01' : 'group-hover:bg-grey-01'
          )}
        />
        <div className="relative z-10 flex w-full items-center gap-2">{children}</div>
      </Link>
    );
  }

  return (
    <button
      className={cx('group relative flex w-full items-center bg-white px-3 py-[10px] text-button text-text', className)}
      {...rest}
    >
      <div
        className={cx(
          'absolute inset-1 z-0 rounded',
          active ? 'bg-grey-01' : 'group-hover:bg-grey-01'
        )}
      />
      <div className="relative z-10 flex w-full items-center gap-2">{children}</div>
    </button>
  );
}
