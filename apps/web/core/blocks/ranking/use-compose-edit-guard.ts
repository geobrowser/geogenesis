'use client';

import * as React from 'react';

import { useAccessControl } from '~/core/hooks/use-access-control';
import { useAuthResolving } from '~/core/hooks/use-auth-resolving';
import { useHydrated } from '~/core/hooks/use-hydrated';
import { useFeatureFlag } from '~/core/state/feature-flags';

import { canComposeEditBlock, isBestDebatesBlock } from './best-debates-views';

export type ComposeEditGuard = {
  isBestDebates: boolean;
  /** `canComposeEditBlock` for this viewer. */
  allowed: boolean;
  /**
   * True once `allowed` is final: always on other blocks; on Best debates after the flags have
   * hydrated and the block space's access has been read. Act on a refusal only when settled, or a
   * member would be bounced while their membership loads.
   */
  settled: boolean;
};

/** `canComposeEditBlock` with its inputs read for the current viewer (GEO-3677). */
export function useComposeEditGuard({
  blockId,
  spaceId,
  bestDebatesBlockId,
}: {
  blockId: string | null | undefined;
  spaceId: string;
  /** Tests only: stands in for `BEST_DEBATES_BLOCK_ID`. */
  bestDebatesBlockId?: string | null;
}): ComposeEditGuard {
  const hydrated = useHydrated();
  const flagOn = useFeatureFlag('debateRankings');
  const { canEdit, isLoading } = useAccessControl(spaceId);
  // A pasted compose URL loads with sign-in still starting: until the account resolves, the access
  // read answers "no access, not loading", which bounced members to view mode (12 Nov). Wait for it,
  // but not forever: an account that never resolves settles as signed out after a while.
  const authResolving = useAuthResolving();
  const authGaveUp = useGaveUpAfter(authResolving, AUTH_WAIT_MS);
  const isBestDebates = isBestDebatesBlock(blockId, spaceId, bestDebatesBlockId);
  const allowed = canComposeEditBlock({ blockId, spaceId, flagOn, canEdit, bestDebatesBlockId });
  const settled = !isBestDebates || (hydrated && (!authResolving || authGaveUp) && !isLoading);
  return { isBestDebates, allowed, settled };
}

/** How long a compose URL waits for sign-in to resolve before treating the viewer as signed out. */
const AUTH_WAIT_MS = 20_000;

/** True once `waiting` has stayed true for `ms`; false again as soon as it stops. */
function useGaveUpAfter(waiting: boolean, ms: number): boolean {
  const [gaveUp, setGaveUp] = React.useState(false);
  React.useEffect(() => {
    if (!waiting) {
      setGaveUp(false);
      return;
    }
    const timer = window.setTimeout(() => setGaveUp(true), ms);
    return () => window.clearTimeout(timer);
  }, [waiting, ms]);
  return gaveUp;
}
