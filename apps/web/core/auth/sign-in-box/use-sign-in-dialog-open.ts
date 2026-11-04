'use client';

import { usePrivy } from '~/core/wallet/auth-hooks';

import { useSignInBoxRequest } from './sign-in-box-store';

/** Privy's dialog or our sign-in box is on screen: whichever `useTrackedLogin` opened. */
export function useSignInDialogOpen() {
  const { isModalOpen } = usePrivy();
  const box = useSignInBoxRequest();
  return isModalOpen || box !== null;
}
