import { atomWithStorage, createJSONStorage } from 'jotai/utils';

const sessionStorageJSON = createJSONStorage<string | null>(() => sessionStorage);

export const rankingComposeReturnHrefAtom = atomWithStorage<string | null>(
  'rankingComposeReturnHref',
  null,
  sessionStorageJSON
);
