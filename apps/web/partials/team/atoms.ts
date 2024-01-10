'use client';

import { atom } from 'jotai';

import { Entity as EntityType } from '~/core/types';

type TeamMemberStep = 'start' | 'find' | 'create';

type Role = { id: string; name: string | null } | EntityType;

export const teamMemberStepAtom = atom<TeamMemberStep>('start');

export const teamMemberAvatarAtom = atom<string | null>(null);

export const teamMemberNameAtom = atom<string | null>(null);

export const teamMemberRoleAtom = atom<Role | null>(null);
