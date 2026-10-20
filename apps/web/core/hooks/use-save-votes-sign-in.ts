'use client';

import { useCallback } from 'react';

import { saveVotesSignInProperties } from '~/core/save-votes-analytics';

import { usePrivySignIn } from './use-privy-sign-in';

/**
 * Opens Privy's sign-in as a save of the votes on this device (GEO-3214). The attempt it starts
 * carries `auth_intent: 'save_votes'`, which is what `LocalVotesSaver` checks before it saves: any
 * other sign-in clears the votes, and dismissing this one records it as closed.
 */
export function useSaveVotesSignIn() {
  const signIn = usePrivySignIn();
  return useCallback(
    (authControl: string, localVoteCount: number) => signIn(saveVotesSignInProperties(authControl, localVoteCount)),
    [signIn]
  );
}
