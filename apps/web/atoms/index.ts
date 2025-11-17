import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

export const showingIdsAtom = atomWithStorage<boolean>('showingIds', false);

export const editingPropertiesAtom = atom<boolean>(false);

export const editorHasContentAtom = atom<boolean>(false);

export const dismissedNoticesAtom = atomWithStorage<Array<string>>('dismissedNotices', []);

export type RepeatingNotice = { dismissedCount: number; lastDismissed: string };

export const teamNoticeDismissedAtom = atomWithStorage<RepeatingNotice>('dismissedTeamNotice', {
  dismissedCount: 0,
  lastDismissed: '',
});

export const onboardCodeAtom = atomWithStorage<string>('onboardCode', '');
