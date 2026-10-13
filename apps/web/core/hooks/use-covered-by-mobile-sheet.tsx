'use client';

import * as React from 'react';

import { isAnyMobileSheetOpen, subscribeMobileSheetOpen } from '~/core/utils/mobile-sheet-drag';

const InsideMobileSheetContext = React.createContext(false);

/** Marks content rendered inside a mobile sheet, which a sheet never covers. */
export function InsideMobileSheet({ children }: { children: React.ReactNode }) {
  return <InsideMobileSheetContext.Provider value>{children}</InsideMobileSheetContext.Provider>;
}

/**
 * Whether a mobile sheet is open over this part of the page: true behind the side panel, the
 * Debates hub or the ranking preview while one is up, false inside them. Sheets only open on the
 * mobile layout, so this is always false on desktop.
 */
export function useCoveredByMobileSheet(): boolean {
  const inside = React.useContext(InsideMobileSheetContext);
  const open = React.useSyncExternalStore(subscribeMobileSheetOpen, isAnyMobileSheetOpen, () => false);
  return open && !inside;
}
