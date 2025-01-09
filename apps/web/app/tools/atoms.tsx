import type { Op } from '@geogenesis/sdk';
import { atom } from 'jotai';

export const cloneSpaceNameAtom = atom('');
export const cloneSpaceIdAtom = atom('');
export const cloneOpsAtom = atom<Array<Op>>([]);
