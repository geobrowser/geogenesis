import { usePrivy } from '@geogenesis/auth';

import { usePersonalSpaceId } from './use-personal-space-id';

/**
 * Temporarily hide some elements in the interface until we open up for GA.
 * The knowledge graph is permissionless, so we can't prevent people from
 * creating spaces and writing data to the system, but we can disable it in
 * the Geogenesis interface. As of Jan 03, 2025, Geogenesis is the only
 * user interface into the knowledge graph.
 */
export function useOnboardGuard() {
  const { user } = usePrivy();
  const { isRegistered } = usePersonalSpaceId();

  return {
    shouldShowElement: Boolean(isRegistered && user),
  };
}
