'use client';

import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { usePrivySignIn } from '~/core/hooks/use-privy-sign-in';
import { useRequestToBeMember } from '~/core/hooks/use-request-to-be-member';
import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { useQueuedAction } from '~/core/state/pending-actions';
import { usePendingPersonalSpace } from '~/core/state/pending-personal-space';

type UseJoinSpaceArgs = {
  spaceId: string;
  /** Passed through to `useRequestToBeMember` so the pending-membership entry can show the space. */
  space?: { name?: string; image?: string | null };
};

/**
 * The one press handler every Join control shares, covering the three states a viewer can be in:
 *
 * - Signed in with a registered personal space: request membership now.
 * - Signed out: queue the request and open Privy. `PendingActionsRunner` submits it once the new
 *   account has a personal space; a dismissed sign-in withdraws it.
 * - Signed in, personal space still registering: queue the request the same way.
 *
 * Queued at the press either way, into the app-level queue rather than anything this button owns:
 * the button can unmount while the viewer signs up, and the request has to outlive it. The
 * "requested" state is read off the queue for the same reason, until the request lands and the
 * persisted membership bridge takes over.
 */
export function useJoinSpace({ spaceId, space }: UseJoinSpaceArgs) {
  const { requestToBeMember, requestToBeMemberAsync, status } = useRequestToBeMember({ spaceId, space });
  const { smartAccount } = useSmartAccount();
  const { personalSpaceId, isRegistered, isLoading: isPersonalSpaceLoading } = usePersonalSpaceId();
  // Signed in without a usable space, the request is held only when one is on its way: being created
  // for a new account, or still loading for a returning one. With neither, nothing would ever send
  // it, and the button would read "Requested" for a request that never goes.
  const { isPending: isAccountSetupPending } = usePendingPersonalSpace();
  const promptSignIn = usePrivySignIn(undefined, {
    analytics: {
      component: 'join_space_button',
      target_type: 'space',
      target_id: spaceId,
      auth_control: 'join_space',
      auth_intent: 'join_space',
      auth_continuation: 'queued',
    },
  });
  const queuedJoin = useQueuedAction({
    id: `join:${spaceId}`,
    component: 'join_space_button',
    label: 'your membership request',
    run: (_intent, { isCurrent }) => requestToBeMemberAsync({ fromQueue: true, isCurrent }).then(() => {}),
  });
  const optimisticRequested = queuedJoin.isQueued;

  const canRequestLive = Boolean(smartAccount && isRegistered && personalSpaceId);

  const join = () => {
    if (canRequestLive) {
      requestToBeMember();
      return;
    }
    if (!smartAccount) {
      queuedJoin.queue();
      promptSignIn(undefined, { onCancel: queuedJoin.cancel });
      return;
    }
    if (isAccountSetupPending || isPersonalSpaceLoading) queuedJoin.queue();
  };

  return { join, status, optimisticRequested };
}
