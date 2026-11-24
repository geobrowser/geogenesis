import * as React from 'react';

import { useAtomValue, useSetAtom } from 'jotai';
import { usePathname } from 'next/navigation';

import { graphExplorerUnavailableAtom } from '~/atoms';

/** One explorer page: hops rewrite the last segment, so deeper paths are not the explorer. */
export function isGraphExplorerPath(pathname: string | null): boolean {
  return /^\/explore\/graph\/[^/]+\/?$/.test(pathname ?? '');
}

/**
 * Whether the app drops its chrome for the graph explorer. Decided by the path, so the server render
 * and every hydration order agree; the page opts back in only when it is not showing the explorer.
 */
export function useGraphExplorerActive(): boolean {
  const unavailable = useAtomValue(graphExplorerUnavailableAtom);
  return isGraphExplorerPath(usePathname()) && !unavailable;
}

/** For a state on the explorer route that is not the explorer: gives the app its chrome back. */
export function useGraphExplorerUnavailable() {
  const setUnavailable = useSetAtom(graphExplorerUnavailableAtom);
  React.useLayoutEffect(() => {
    setUnavailable(true);
    return () => setUnavailable(false);
  }, [setUnavailable]);
}
