'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

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

import { usePersonalSpaceId } from './use-personal-space-id';
import { useSmartAccount } from './use-smart-account';
import { useSmartAccountTransaction } from './use-smart-account-transaction';

export function useLeaveSpace(spaceId: string) {
  const { smartAccount } = useSmartAccount();
  const { personalSpaceId, isRegistered } = usePersonalSpaceId();
  const tx = useSmartAccountTransaction();
  const { dispatch } = useStatusBar();
  const queryClient = useQueryClient();
  const router = useRouter();

  const mutation = useMutation({
    mutationFn: async () => {
      if (!smartAccount) throw new Error('Please connect your wallet to leave this space');
      if (!personalSpaceId || !isRegistered) {
        throw new Error('You need a registered personal space to leave this space');
      }

      const call = encodeLeaveSpaceCall({ registry: SPACE_REGISTRY_ADDRESS, personalSpaceId, spaceId });
      const result = await runEffectEither(
        tx(call).pipe(
          Effect.withSpan('web.write.leaveSpace'),
          Effect.annotateSpans({ 'io.operation': 'leave_space', 'space.type': 'DAO' })
        )
      );
      if (Either.isLeft(result)) throw result.left;
      return personalSpaceId;
    },
    onSuccess: async memberSpaceId => {
      store.set(requestedMembershipSpacesAtom, prev => removeRequestedMembershipSpace(prev, spaceId, memberSpaceId));

      // The receipt precedes indexing. A single immediate refresh can read the old
      // membership and leave the button looking inert even though the write landed.
      // Bound this wait; indexer trouble must never turn a mined leave into a failed
      // transaction that invites the user to submit it again.
      for (let attempt = 0; attempt < 10; attempt++) {
        const membership = await runEffectEither(
          getIsMemberOfSpace(normalizeSpaceId(spaceId), normalizeSpaceId(memberSpaceId)).pipe(
            Effect.timeout('2 seconds')
          )
        );
        if (Either.isRight(membership) && !membership.right) break;
        if (attempt < 9) await new Promise(resolve => setTimeout(resolve, 1000));
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['space', spaceId] }),
        queryClient.invalidateQueries({ queryKey: ['space-participants', spaceId, 'members'] }),
        queryClient.invalidateQueries({ queryKey: ['space-access-control', 'member', normalizeSpaceId(spaceId)] }),
        queryClient.invalidateQueries({ queryKey: ['space-roles', normalizeSpaceId(spaceId)] }),
        queryClient.invalidateQueries({ queryKey: ['spaces-where-member'] }),
        queryClient.invalidateQueries({ queryKey: ['creatable-space-ids'] }),
        queryClient.invalidateQueries({ queryKey: ['pending-memberships'] }),
        queryClient.invalidateQueries({ queryKey: ['browse-sidebar-data'] }),
      ]);
      router.refresh();
    },
    onError: error => {
      dispatch({ type: 'ERROR', payload: String(error) });
    },
  });

  return { leaveSpace: mutation.mutate, leaveSpaceAsync: mutation.mutateAsync, status: mutation.status };
}
