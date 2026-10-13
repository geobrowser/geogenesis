'use client';

import * as React from 'react';

import { getTopMobileSheet, subscribeMobileSheetOpen } from '~/core/utils/mobile-sheet-drag';

const InsideMobileSheetContext = React.createContext<symbol | null>(null);

/** Marks content rendered inside `sheet`, which that sheet never covers. */
export function InsideMobileSheet({ sheet, children }: { sheet: symbol; children: React.ReactNode }) {
  return <InsideMobileSheetContext.Provider value={sheet}>{children}</InsideMobileSheetContext.Provider>;
}

/**
 * Whether a mobile sheet is open over this part of the page: true behind the side panel, the
 * Debates hub or the ranking preview while one is up, and true inside a sheet once another opens
 * on top of it. Sheets only open on the mobile layout, so this is always false on desktop.
 */
export function useCoveredByMobileSheet(): boolean {
  const inside = React.useContext(InsideMobileSheetContext);
  const top = React.useSyncExternalStore(subscribeMobileSheetOpen, getTopMobileSheet, () => null);
  return top !== null && top !== inside;
}
