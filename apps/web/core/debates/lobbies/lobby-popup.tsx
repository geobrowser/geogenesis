'use client';

import * as React from 'react';

import { flushSync } from 'react-dom';

import { useIsPhoneLayout } from '~/core/hooks/use-is-phone-layout';

import { BottomSheet } from '~/design-system/bottom-sheet';
import { Menu, type MenuAlign } from '~/design-system/menu';

type Handoff = {
  /** Inside a lobby popup. */
  inPopup: boolean;
  /** Closes the popup now; nothing outside one. */
  close: () => void;
  /**
   * For an action that opens another modal (sign-in): closes the popup first and runs `then` once
   * its focus trap and focus return are done. Outside a popup, runs it now.
   */
  handoff: (then: () => void) => void;
};

const OUTSIDE: Handoff = { inPopup: false, close: () => undefined, handoff: then => then() };
const LobbyHandoffContext = React.createContext<Handoff>(OUTSIDE);

export function useLobbyHandoff() {
  return React.useContext(LobbyHandoffContext);
}

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
  const handoff = React.useMemo<Handoff>(
    () => ({
      inPopup: true,
      close: () => onOpenChange(false),
      handoff: then => {
        // Committed now, so Radix's focus return (queued on unmount) runs before `then`.
        flushSync(() => onOpenChange(false));
        setTimeout(then, 0);
      },
    }),
    [onOpenChange]
  );
  const content = open ? <LobbyHandoffContext.Provider value={handoff}>{children}</LobbyHandoffContext.Provider> : null;

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
