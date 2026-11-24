import { useAtomValue } from 'jotai';
import { usePathname } from 'next/navigation';

import { useHydrated } from '~/core/hooks/use-hydrated';

import { graphExplorerActiveAtom } from '~/atoms';

export function isGraphExplorerPath(pathname: string | null): boolean {
  return /^\/explore\/graph(\/|$)/.test(pathname ?? '');
}

/**
 * Whether the app drops its chrome for the graph explorer. The route decides on the server and until
 * hydration, so the first paint is the explorer; then the page's atom does, as the flag is known.
 */
export function useGraphExplorerActive(): boolean {
  const active = useAtomValue(graphExplorerActiveAtom);
  const pathname = usePathname();
  const hydrated = useHydrated();
  return active || (!hydrated && isGraphExplorerPath(pathname));
}
