import { atomWithStorage } from 'jotai/utils';

/** Open on first visit; after the user toggles, `browseSidebarOpen` in localStorage wins. */
export const browseSidebarOpenAtom = atomWithStorage<boolean>('browseSidebarOpen', true);
