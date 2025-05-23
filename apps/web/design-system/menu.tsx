'use client';

import { PopoverContent, Root, Trigger } from '@radix-ui/react-popover';
import { cva } from 'class-variance-authority';
import cx from 'classnames';

import * as React from 'react';

import { PrefetchLink as Link } from '~/design-system/prefetch-link';

interface Props {
  children: React.ReactNode;
  trigger: React.ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  align?: 'start' | 'center' | 'end';
  side?: 'bottom' | 'left' | 'right' | 'top';
  sideOffset?: number;
  className?: string;
  asChild?: boolean;
  modal?: boolean;
}

const contentStyles = cva('z-20 w-[360px] overflow-hidden rounded-lg border border-grey-02 shadow-lg', {
  variants: {
    align: {
      start: 'origin-top-left',
      center: 'origin-top',
      end: 'origin-top-right',
    },
  },
});

export function Menu({
  children,
  trigger,
  open,
  onOpenChange,
  side,
  sideOffset = 8,
  align = 'end',
  asChild = false,
  className = '',
  modal = false,
}: Props) {
  // @TODO: accessibility for button focus states
  return (
    <Root onOpenChange={onOpenChange} open={open} modal={modal}>
      <Trigger asChild={asChild}>{trigger}</Trigger>
      <PopoverContent align={align} side={side} sideOffset={sideOffset} className={contentStyles({ align, className })}>
        {children}
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
        <div className="relative z-10 flex items-center gap-2">{children}</div>
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
