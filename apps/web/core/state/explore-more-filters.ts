import { atomWithStorage } from 'jotai/utils';

/**
 * Whether this viewer has opened Explore's "More filters". Only the reveal is kept, never a
 * selection: a filter narrowing the feed from a menu the viewer cannot see is what #2628 removed
 * the menus to avoid, so the revealed menus always open on Explore's defaults.
 */
export const exploreMoreFiltersOpenAtom = atomWithStorage<boolean>('exploreMoreFiltersOpen', false);
