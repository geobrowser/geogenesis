import { useAtomValue } from 'jotai';

import { Environment } from '../environment';
import { onboardCodeAtom } from '~/atoms';

/**
 * Temporarily hide some elements in the interface until we open up for GA.
 * The knowledge graph is permissionless, so we can't prevent people from
 * creating spaces and writing data to the system, but we can disable it in
 * the Geogenesis interface. As of Jan 03, 2025, Geogenesis is the only
 * user interface into the knowledge graph.
 */
export function useOnboardGuard() {
  const onboardCode = useAtomValue(onboardCodeAtom);
  const hasValidCode = onboardCode === Environment.variables.onboardCode;

  return {
    shouldShowElement: hasValidCode,
  };
}
