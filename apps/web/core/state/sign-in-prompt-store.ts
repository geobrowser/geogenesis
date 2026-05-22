import { atom, useAtom } from 'jotai';

export type SignInPromptAction = 'vote' | 'join' | 'comment';

export const signInPromptActionAtom = atom<SignInPromptAction | null>(null);

export function useSignInPrompt() {
  const [action, setAction] = useAtom(signInPromptActionAtom);

  return {
    action,
    open: (next: SignInPromptAction) => setAction(next),
    close: () => setAction(null),
  };
}
