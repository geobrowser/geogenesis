'use client';

import { useCallback } from 'react';

import { saveVotesSignInProperties } from '~/core/save-votes-analytics';
import { clearSaveRequested, markSaveRequested } from '~/core/state/local-votes';

import { usePrivySignIn } from './use-privy-sign-in';

/**
 * Opens Privy's sign-in as a save of the votes on this device (GEO-3214). Only a sign-in a save
 * prompt started saves them; any other sign-in clears them (see `LocalVotesSaver`).
 *
 * Dismissing the dialog withdraws the request, so a later sign-in some other way still reads as "not
 * a save".
 */
export function useSaveVotesSignIn() {
  const signIn = usePrivySignIn();
  return useCallback(
    (authControl: string, localVoteCount: number) => {
      markSaveRequested();
      return signIn(saveVotesSignInProperties(authControl, localVoteCount), { onCancel: clearSaveRequested });
    },
    [signIn]
  );
}
