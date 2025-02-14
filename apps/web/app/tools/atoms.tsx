import type { Op } from '@graphprotocol/grc-20';
import { atom } from 'jotai';

export const cloneSpaceNameAtom = atom('');
export const cloneSpaceIdAtom = atom('');
export const cloneOpsAtom = atom<Array<Op>>([]);
