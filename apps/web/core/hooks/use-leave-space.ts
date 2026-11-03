'use client';

import { useMutation, useMutationState, useQueryClient } from '@tanstack/react-query';

import { useCallback, useEffect, useMemo } from 'react';

import { Effect, Either } from 'effect';
import { useRouter } from 'next/navigation';

import { normalizeSpaceId } from '~/core/access/space-access';
import { getIsMemberOfSpace } from '~/core/io/queries';
import { SPACE_REGISTRY_ADDRESS } from '~/core/sdk/geo-network';
import { store } from '~/core/state/jotai-store';
import { removeRequestedMembershipSpace, requestedMembershipSpacesAtom } from '~/core/state/requested-membership';
import { useStatusBar } from '~/core/state/status-bar-store';
import { runEffectEither } from '~/core/telemetry/effect-runtime';
import { encodeLeaveSpaceCall } from '~/core/utils/contracts/leave-space';
import { readSpaceMembership } from '~/core/utils/contracts/read-space-membership';
import { waitForIndexedValue } from '~/core/utils/wait-for-indexed-value';

import { usePersonalSpaceId } from './use-personal-space-id';
import { useSmartAccount } from './use-smart-account';
import { useSmartAccountTransaction } from './use-smart-account-transaction';

export function useLeaveSpace(spaceId: string, isMember: boolean) {
  const { smartAccount } = useSmartAccount();
  const { personalSpaceId, isRegistered } = usePersonalSpaceId();
  const tx = useSmartAccountTransaction();
  const { dispatch } = useStatusBar();
  const queryClient = useQueryClient();
  const router = useRouter();
  const mutationKey = useMemo(
    () => ['leave-space', normalizeSpaceId(spaceId), personalSpaceId && normalizeSpaceId(personalSpaceId)],
    [spaceId, personalSpaceId]
  );
  // Like follow controls, a reopened popover observes the write that outlived it.
  const pending = useMutationState({ filters: { mutationKey, exact: true, status: 'pending' } });

  const mutation = useMutation({
    mutationKey,
    mutationFn: async () => {
      if (!smartAccount) throw new Error('Please connect your wallet to leave this space');
      if (!personalSpaceId || !isRegistered) {
        throw new Error('You need a registered personal space to leave this space');
      }

      const call = encodeLeaveSpaceCall({ registry: SPACE_REGISTRY_ADDRESS, personalSpaceId, spaceId });
      // A prior confirmed leave can outlive the indexing wait and the popover.
      // Read the chain before submitting again; an already-left member only needs
      // reconciliation, while someone who has rejoined can leave normally.
      if (await readSpaceMembership(spaceId, personalSpaceId)) {
        const result = await runEffectEither(
          tx(call).pipe(
            Effect.withSpan('web.write.leaveSpace'),
            Effect.annotateSpans({ 'io.operation': 'leave_space', 'space.type': 'DAO' })
          )
        );
        if (Either.isLeft(result)) throw result.left;
      }
      // Mutation options can change during navigation. Reconcile the submitted
      // target and identity, never the hook's latest props.
      return { spaceId, memberSpaceId: personalSpaceId };
    },
    onSuccess: async ({ spaceId: targetSpaceId, memberSpaceId }) => {
      try {
        store.set(requestedMembershipSpacesAtom, prev =>
          removeRequestedMembershipSpace(prev, targetSpaceId, memberSpaceId)
        );
      } catch (error) {
        // Local storage can be full or blocked. The transaction already landed.
        console.warn('[leave-space] Could not clear the persisted membership request', error);
      }

      // The receipt precedes indexing. A single immediate refresh can read the old
      // membership and leave the button looking inert even though the write landed.
      // Bound this wait; indexer trouble must never turn a mined leave into a failed
      // transaction that invites the user to submit it again.
      const normalizedSpaceId = normalizeSpaceId(targetSpaceId);
      await waitForIndexedValue(
        signal => Effect.runPromise(getIsMemberOfSpace(normalizedSpaceId, normalizeSpaceId(memberSpaceId), signal)),
        false,
        10,
        1_000,
        2_000
      );

      const queryKeys = [
        ['space', targetSpaceId],
        ['space-participants', targetSpaceId, 'members'],
        ['space-access-control', 'member', normalizedSpaceId],
        ['space-roles', normalizedSpaceId],
        ['spaces-where-member'],
        ['creatable-space-ids'],
        ['pending-memberships'],
        ['browse-sidebar-data'],
      ];
      // A failed refetch must not hide the page refresh or turn a mined write into
      // a retryable transaction error.
      await Promise.allSettled(queryKeys.map(async queryKey => queryClient.invalidateQueries({ queryKey })));
      router.refresh();
    },
    onError: error => {
      dispatch({ type: 'ERROR', payload: String(error) });
    },
  });

  const { mutateAsync, reset } = mutation;
  // The popover can stay mounted through leave -> join. Its previous success
  // must not keep the Leave button disabled for the new membership.
  useEffect(() => {
    if (!isMember) reset();
  }, [isMember, reset]);
  const leaveSpaceAsync = useCallback(async () => {
    // Read the cache synchronously: even two presses before a render share one write.
    if (queryClient.getMutationCache().findAll({ mutationKey, exact: true, status: 'pending' }).length > 0) {
      return;
    }
    return mutateAsync();
  }, [queryClient, mutationKey, mutateAsync]);
  const leaveSpace = () => {
    void leaveSpaceAsync().catch(() => {});
  };

  return { leaveSpace, leaveSpaceAsync, status: pending.length > 0 ? ('pending' as const) : mutation.status };
}
