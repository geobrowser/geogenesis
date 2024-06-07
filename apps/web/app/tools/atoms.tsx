import { atom } from 'jotai';

import { CreateTripleAction } from '~/core/types';

export const cloneSpaceNameAtom = atom('');
export const cloneSpaceIdAtom = atom('');
export const cloneActionsAtom = atom<Array<CreateTripleAction>>([]);
