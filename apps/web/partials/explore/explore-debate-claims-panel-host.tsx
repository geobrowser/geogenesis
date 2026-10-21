'use client';

import * as React from 'react';

import { useAtomValue, useSetAtom } from 'jotai';
import { usePathname } from 'next/navigation';
import { createPortal } from 'react-dom';

import { ActionContextProvider } from '~/core/action-context-provider';
import { DebateClaimsPanel } from '~/core/debates/browse/debate-claims-panel';

import { exploreDebateClaimsPanelAtom, openExploreDebateClaimsPanelAtom } from '~/atoms';

/**
 * The claims panel an explore card's Claims button opens. A right-hand overlay rather than the
 * full-screen feed's side rail, since explore cards have no rail to put it in.
 */
export function ExploreDebateClaimsPanelHost() {
  const target = useAtomValue(exploreDebateClaimsPanelAtom);
  const setTarget = useSetAtom(openExploreDebateClaimsPanelAtom);

  // Closes on navigation, like the comments panel. Only on a change: closing on mount would shut the
  // panel the moment it opened.
  const pathname = usePathname();
  const lastPathnameRef = React.useRef(pathname);
  React.useEffect(() => {
    if (lastPathnameRef.current === pathname) return;
    lastPathnameRef.current = pathname;
    setTarget(null);
  }, [pathname, setTarget]);

  if (!target || typeof document === 'undefined') return null;

  return createPortal(
    <ActionContextProvider value={target.scope}>
      <div className="fixed inset-y-0 right-0 z-100 flex bg-white shadow-card">
        <DebateClaimsPanel debate={target.debate} onClose={() => setTarget(null)} />
      </div>
    </ActionContextProvider>,
    document.body
  );
}
