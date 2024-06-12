import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

export const editingColumnsAtom = atom(false);

export const dismissedNoticesAtom = atomWithStorage<Array<string>>('dismissedNotices', []);

type TeamMemberStep = 'start' | 'find' | 'create';
export const teamMemberStepAtom = atom<TeamMemberStep>('start');
export const teamMemberAvatarAtom = atom<string | null>(null);
export const teamMemberNameAtom = atom<string | null>(null);
export const teamMemberRoleAtom = atom<any>(null);
