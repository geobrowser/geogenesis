'use client';

import { useAccountResolving } from '~/core/wallet/account-readiness';

/**
 * Whether the viewer is not yet known to be signed out: Privy still starting, or signed in with
 * the account not ready to write. See `useAccountResolving`.
 */
export function useAuthResolving(): boolean {
  return useAccountResolving();
}
