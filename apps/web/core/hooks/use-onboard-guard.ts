import { usePrivy } from '@geogenesis/auth';

import { useGeoProfile } from './use-geo-profile';
import { useSmartAccount } from './use-smart-account';

/**
 * Temporarily hide some elements in the interface until we open up for GA.
 * The knowledge graph is permissionless, so we can't prevent people from
 * creating spaces and writing data to the system, but we can disable it in
 * the Geogenesis interface. As of Jan 03, 2025, Geogenesis is the only
 * user interface into the knowledge graph.
 */
export function useOnboardGuard() {
  const { smartAccount } = useSmartAccount();
  const address = smartAccount?.account.address;
  const { user } = usePrivy();
  const { profile } = useGeoProfile(address);

  return {
    shouldShowElement: Boolean(profile?.profileLink || user),
  };
}
