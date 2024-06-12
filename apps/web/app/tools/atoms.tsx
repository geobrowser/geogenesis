import { atom } from 'jotai';

import { Triple } from '~/core/types';

export const cloneSpaceNameAtom = atom('');
export const cloneSpaceIdAtom = atom('');
export const cloneTriplesAtom = atom<Array<Triple>>([]);
