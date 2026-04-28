'use client';

import { PopoverContent, Root, Trigger } from '@radix-ui/react-popover';

import * as React from 'react';

import { cva } from 'class-variance-authority';
import cx from 'classnames';

import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { trapWheelToElement } from '~/design-system/trap-wheel-scroll';
import { useAdaptiveDropdownPlacement } from '~/design-system/use-adaptive-dropdown-placement';

interface Props {
  children: React.ReactNode;
  trigger: React.ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sideOffset?: number;
  className?: string;
  asChild?: boolean;
  modal?: boolean;
}

/** Outer shell: opaque + clips corners so overscroll never reveals “holes” behind the panel. */
const shellStyles = cva(
  'z-100 w-full max-w-[360px] min-w-0 overflow-hidden rounded-lg border border-grey-02 bg-white shadow-lg outline-none focus:outline-none focus-visible:outline-none isolate',
  {
  variants: {
    align: {
      start: 'origin-top-left',
      center: 'origin-top',
      end: 'origin-top-right',
    },
  },
});

const scrollViewportClass =
  'w-full max-h-[180px] min-h-0 min-w-0 overflow-y-auto overscroll-contain scroll-smooth bg-white [background-clip:padding-box]';

export function Menu({
  children,
  trigger,
  open,
  onOpenChange,
  sideOffset = 8,
  asChild = false,
  className = '',
  modal = false,
}: Props) {
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const { align: adaptiveAlign, side: adaptiveSide } = useAdaptiveDropdownPlacement(triggerRef, {
    isOpen: open,
    preferredHeight: 180,
    gap: 8,
  });

  const scrollRef = React.useRef<HTMLDivElement>(null);

  const onMenuWheel = React.useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    trapWheelToElement(scrollRef.current, e);
  }, []);

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
        onWheel={onMenuWheel}
      >
        <div ref={scrollRef} className={scrollViewportClass}>
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
            active ? 'bg-grey-01' : 'transition-colors duration-75 group-hover:bg-grey-01'
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
          active ? 'bg-grey-01' : 'transition-colors duration-75 group-hover:bg-grey-01'
        )}
      />
      <div className="relative z-10 flex w-full items-center gap-2">{children}</div>
    </button>
  );
}
