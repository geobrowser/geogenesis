'use client';

import * as React from 'react';

import { atom, useAtomValue, useSetAtom } from 'jotai';
import { usePathname, useSearchParams } from 'next/navigation';

/** Whether tabs on this page can switch without the server. */
const inPageTabSwitchAtom = atom(false);

/** Render on a page to let its tabs switch without the server. */
export function InPageTabSwitch() {
  const setEnabled = useSetAtom(inPageTabSwitchAtom);

  React.useEffect(() => {
    setEnabled(true);
    return () => setEnabled(false);
  }, [setEnabled]);

  return null;
}

/** Shows its content on Overview only, and hides it once a tab is open. */
export function OverviewOnly({ children }: { children: React.ReactNode }) {
  const tabId = useSearchParams()?.get('tabId');
  return tabId ? null : <>{children}</>;
}

/** Whether a click on this link switches the tab in place, so prefetching it is wasted. */
export function useSwitchesInPage(href: string) {
  const enabled = useAtomValue(inPageTabSwitchAtom);
  const pathname = usePathname();
  const url = new URL(href, 'http://localhost');
  return enabled && url.pathname === pathname && Boolean(url.searchParams.get('tabId'));
}

/**
 * Switches to a `?tabId=` tab on the same page by changing the URL, without asking the server.
 * Other links, including Overview, navigate as usual.
 *
 * `onPending` marks the clicked tab first. The URL changes after the next paint, so the mark
 * shows before the new tab renders.
 */
export function useInPageTabSwitch() {
  const enabled = useAtomValue(inPageTabSwitchAtom);

  return React.useCallback(
    (event: React.MouseEvent<HTMLAnchorElement>, href: string, onPending?: () => void) => {
      if (!enabled || event.defaultPrevented) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;

      const url = new URL(href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname !== window.location.pathname) return;
      if (!url.searchParams.get('tabId')) return;

      event.preventDefault();
      onPending?.();
      requestAnimationFrame(() => {
        setTimeout(() => window.history.pushState(null, '', `${url.pathname}${url.search}`), 0);
      });
    },
    [enabled]
  );
}
