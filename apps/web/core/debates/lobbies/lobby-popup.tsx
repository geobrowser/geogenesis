'use client';

import type * as React from 'react';

import { useIsPhoneLayout } from '~/core/hooks/use-is-phone-layout';

import { BottomSheet } from '~/design-system/bottom-sheet';
import { Menu, type MenuAlign } from '~/design-system/menu';

/**
 * A lobby menu: a dropdown on desktop, a bottom sheet on a phone. The content mounts on each open,
 * so a confirm or error from last time does not linger.
 */
export function LobbyPopup({
  open,
  onOpenChange,
  trigger,
  title,
  align = 'end',
  wide = false,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: React.ReactNode;
  /** The sheet's accessible name; label the content itself for the dropdown. */
  title: string;
  align?: MenuAlign;
  /** Room for lists rather than a column of actions. */
  wide?: boolean;
  children: React.ReactNode;
}) {
  const phone = useIsPhoneLayout();
  const content = open ? children : null;

  if (phone) {
    return (
      <BottomSheet open={open} onOpenChange={onOpenChange} trigger={trigger} title={title}>
        {content}
      </BottomSheet>
    );
  }
  return (
    <Menu
      open={open}
      onOpenChange={onOpenChange}
      trigger={trigger}
      asChild
      align={align}
      className={wide ? 'max-w-[400px]!' : 'max-w-[280px]!'}
    >
      {content ? <div className={wide ? undefined : 'p-1.5'}>{content}</div> : null}
    </Menu>
  );
}
