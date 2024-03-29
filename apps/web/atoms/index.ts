import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

type TeamMemberStep = 'start' | 'find' | 'create';

export const dismissedNoticesAtom = atomWithStorage<Array<string>>('dismissedNotices', []);

export const teamMemberStepAtom = atom<TeamMemberStep>('start');

export const teamMemberAvatarAtom = atom<string | null>(null);

export const teamMemberNameAtom = atom<string | null>(null);

export const teamMemberRoleAtom = atom<any>(null);
