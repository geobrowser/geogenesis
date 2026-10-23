'use client';

import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { usePrivy } from '~/core/wallet/auth-hooks';

/**
 * Whether the viewer is not yet known to be signed out: Privy still starting, or signed in with
 * the account still loading.
 */
export function useAuthResolving(): boolean {
  const { ready, authenticated } = usePrivy();
  const { smartAccount } = useSmartAccount();

  return !ready || (authenticated && !smartAccount);
}
