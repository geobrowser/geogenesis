'use client';

import * as React from 'react';

export type DebateShareControls = {
  open: boolean;
  onOpen: () => void;
  onOpenChange: (open: boolean) => void;
  openerRef: React.RefObject<HTMLElement | null>;
};

/**
 * Owns the open state for a debate's Share sheet. The Share button opens {@link DebateShareDialog},
 * which hands the debate off to a social platform (or copies the link / downloads the video).
 */
export function useDebateShareAction(): DebateShareControls {
  const [open, setOpen] = React.useState(false);
  const openerRef = React.useRef<HTMLElement | null>(null);
  const onOpen = React.useCallback(() => {
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setOpen(true);
  }, []);
  return {
    open,
    onOpen,
    onOpenChange: setOpen,
    openerRef,
  };
}
