import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

const isDev = process.env.NODE_ENV === 'development';

const atomWithDevStorage = (key: string, initialValue: any) => {
  if (isDev) {
    return atomWithStorage(key, initialValue);
  } else {
    return atom(initialValue);
  }
};

export const cloneSpaceNameAtom = atomWithDevStorage('dev:cloneSpaceName', '');
export const cloneSpaceIdAtom = atomWithDevStorage('dev:cloneSpaceId', '');
export const cloneActionsAtom = atomWithDevStorage('dev:cloneActions', []);
