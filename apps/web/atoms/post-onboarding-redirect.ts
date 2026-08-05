import { atomWithStorage, createJSONStorage } from 'jotai/utils';

const sessionStorageJSON = createJSONStorage<string | null>(() => sessionStorage);

export const postOnboardingRedirectAtom = atomWithStorage<string | null>(
  'postOnboardingRedirect',
  null,
  sessionStorageJSON
);
