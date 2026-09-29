'use client';

import * as React from 'react';

import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { usePrivySignIn } from '~/core/hooks/use-privy-sign-in';
import { useRequestToBeMember } from '~/core/hooks/use-request-to-be-member';
import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { useEnqueuePendingAction } from '~/core/state/pending-actions';
import { useDeferredJoin } from '~/core/state/pending-join-intents';

type UseJoinSpaceArgs = {
  spaceId: string;
  /** Passed through to `useRequestToBeMember` so the pending-membership entry can show the space. */
  space?: { name?: string; image?: string | null };
};

/**
 * The one press handler every Join control shares, covering the three states a viewer can be in:
 *
 * - Signed in with a registered personal space: request membership now.
 * - Signed out: park the intent and open Privy. `useDeferredJoin` replays it once the wallet
 *   connects, which lands in the next branch.
 * - Signed in, personal space still registering: queue the request for `PendingActionsRunner`,
 *   which submits it once the space registers.
 */
export function useJoinSpace({ spaceId, space }: UseJoinSpaceArgs) {
  const { requestToBeMember, requestToBeMemberAsync, status } = useRequestToBeMember({ spaceId, space });
  const { smartAccount } = useSmartAccount();
  const { personalSpaceId, isRegistered } = usePersonalSpaceId();
  const promptSignIn = usePrivySignIn();
  const enqueuePendingAction = useEnqueuePendingAction();
  const [optimisticRequested, setOptimisticRequested] = React.useState(false);

  const queueJoinRequest = React.useCallback(() => {
    setOptimisticRequested(true);
    enqueuePendingAction({
      id: `join:${spaceId}`,
      label: 'your membership request',
      requires: 'personalSpace',
      run: () => requestToBeMemberAsync(),
    });
  }, [enqueuePendingAction, spaceId, requestToBeMemberAsync]);

  const deferJoin = useDeferredJoin(spaceId, Boolean(smartAccount), queueJoinRequest);

  const canRequestLive = Boolean(smartAccount && isRegistered && personalSpaceId);

  const join = () => {
    if (canRequestLive) {
      requestToBeMember();
      return;
    }
    if (!smartAccount) {
      deferJoin();
      promptSignIn();
      return;
    }
    queueJoinRequest();
  };

  return { join, status, optimisticRequested };
}
