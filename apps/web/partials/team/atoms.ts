'use client';

import { atom } from 'jotai';

import { Role } from './types';

type TeamMemberStep = 'start' | 'find' | 'create';

export const draftMembersAtom = atom<Array<number>>([0]);

export const teamMemberStepAtom = atom<TeamMemberStep>('start');

export const teamMemberAvatarAtom = atom<string | null>(null);

export const teamMemberNameAtom = atom<string | null>(null);

export const teamMemberRoleAtom = atom<Role | null>(null);

export const addedTeamMemberAtom = atom<boolean>(false);
