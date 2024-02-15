import { atom } from 'jotai';

type TeamMemberStep = 'start' | 'find' | 'create';

export const teamMemberStepAtom = atom<TeamMemberStep>('start');

export const teamMemberAvatarAtom = atom<string | null>(null);

export const teamMemberNameAtom = atom<string | null>(null);

export const teamMemberRoleAtom = atom<any>(null);
