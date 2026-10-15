import * as React from 'react';

import { atom, useSetAtom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

/** Open on first visit; after the user toggles, `browseSidebarOpen` in localStorage wins. */
export const browseSidebarOpenAtom = atomWithStorage<boolean>('browseSidebarOpen', true);

/**
 * A page's own default for the sidebar while it is open, over the stored choice; `null` when the
 * page has none. Never persisted, so a page that wants the room (a debate lobby) does not change
 * the sidebar anywhere else.
 */
const browseSidebarPageDefaultAtom = atom<boolean | null>(null);

/**
 * Whether the sidebar is open now: the page's default, else the stored choice. Toggling it is the
 * person's own choice, so it is stored and the page's default steps aside.
 */
export const browseSidebarShownAtom = atom(
  get => get(browseSidebarPageDefaultAtom) ?? get(browseSidebarOpenAtom),
  (_get, set, open: boolean) => {
    set(browseSidebarPageDefaultAtom, null);
    set(browseSidebarOpenAtom, open);
  }
);

/** Opens the sidebar as `open` for as long as the calling page is mounted. */
export function useBrowseSidebarPageDefault(open: boolean) {
  const setPageDefault = useSetAtom(browseSidebarPageDefaultAtom);
  React.useLayoutEffect(() => {
    setPageDefault(open);
    return () => setPageDefault(null);
  }, [open, setPageDefault]);
}
