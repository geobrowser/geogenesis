'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useCallback } from 'react';

import { Effect, Either } from 'effect';
import { useSetAtom } from 'jotai';

import { normalizeSpaceId } from '~/core/access/space-access';
import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { useSmartAccountTransaction } from '~/core/hooks/use-smart-account-transaction';
import { getIsEditorOfSpace, getIsMemberOfSpace } from '~/core/io/queries';
import { geo } from '~/core/sdk/geo-client';
import { usePendingPersonalSpace } from '~/core/state/pending-personal-space';
import { requestedMembershipSpacesAtom, upsertRequestedMembershipSpace } from '~/core/state/requested-membership';
import { useStatusBar } from '~/core/state/status-bar-store';
import { runEffectEither } from '~/core/telemetry/effect-runtime';
import { validateSpaceId } from '~/core/utils/utils';

interface UseRequestToBeMemberArgs {
  /** The space ID (bytes16 hex without 0x, e.g., UUID format) of the space to join */
  spaceId: string | null;
  /** Optional display data so the optimistic "pending" row can render a name/image immediately. */
  space?: { name?: string; image?: string | null };
}

export function useRequestToBeMember({ spaceId, space }: UseRequestToBeMemberArgs) {
  const { dispatch } = useStatusBar();

  const { smartAccount } = useSmartAccount();
  const { personalSpaceId, isRegistered } = usePersonalSpaceId();
  const { isPending: isAccountSetupPending } = usePendingPersonalSpace();
  const queryClient = useQueryClient();
  const setRequestedSpaces = useSetAtom(requestedMembershipSpacesAtom);

  const tx = useSmartAccountTransaction();

  const handleRequestToBeMember = useCallback(async () => {
    if (!smartAccount) {
      throw new Error('No smart account available');
    }

    if (!personalSpaceId || !isRegistered) {
      dispatch({
        type: 'ERROR',
        payload: isAccountSetupPending
          ? 'Your account is still finishing setup — try again in a moment.'
          : 'You need a registered personal space ID to request membership',
      });
      throw new Error('User does not have a registered personal space ID');
    }

    if (!validateSpaceId(spaceId)) {
      throw new Error('Invalid target space ID');
    }

    const normalizedSpaceId = normalizeSpaceId(spaceId);
    const normalizedPersonalSpaceId = normalizeSpaceId(personalSpaceId);
    const access = await runEffectEither(
      Effect.all([
        getIsMemberOfSpace(normalizedSpaceId, normalizedPersonalSpaceId),
        getIsEditorOfSpace(normalizedSpaceId, normalizedPersonalSpaceId),
      ])
    );
    if (Either.isRight(access) && (access.right[0] || access.right[1])) {
      dispatch({ type: 'ERROR', payload: 'You are already a member of this space' });
      throw new Error('User is already a member or editor of the space');
    }

    console.log('Requesting to be member', {
      authorSpaceId: personalSpaceId,
      spaceId,
    });

    const { to, calldata } = geo.daoSpaces.proposeRequestMembership({
      authorSpaceId: personalSpaceId,
      spaceId,
    });

    const writeTxEffect = tx({ to, data: calldata }).pipe(
      Effect.withSpan('web.write.requestMembership'),
      Effect.annotateSpans({
        'io.operation': 'request_membership',
        'space.type': 'DAO',
        'governance.action': 'membership_requested',
      })
    );

    const result = await runEffectEither(writeTxEffect);

    Either.match(result, {
      onLeft: error => {
        console.error('Failed to request membership', { spaceId, personalSpaceId }, error);
        dispatch({ type: 'ERROR', payload: `${error}`, retry: handleRequestToBeMember });
        // Necessary to propagate error status to useMutation
        throw error;
      },
      onRight: hash => console.log('Successfully requested to be member. Transaction hash:', hash),
    });
  }, [dispatch, smartAccount, personalSpaceId, isRegistered, isAccountSetupPending, spaceId, tx]);

  const { mutate, status } = useMutation({
    mutationFn: handleRequestToBeMember,
    onSuccess: () => {
      // personalSpaceId is guaranteed here (the request would have thrown without
      // it); the guard also scopes the persisted entry to this account.
      if (!spaceId || !personalSpaceId) return;
      // Optimistic, persisted bridge so the "Membership pending" state shows
      // instantly (and survives a refresh) regardless of where the request was
      // made, while the indexer catches up.
      setRequestedSpaces(prev =>
        upsertRequestedMembershipSpace(prev, {
          id: spaceId,
          ownerId: personalSpaceId,
          requestedAt: Date.now(),
          name: space?.name,
          image: space?.image,
        })
      );
      // Refetch the durable sources so every surface converges on the server state.
      queryClient.invalidateQueries({ queryKey: ['pending-memberships'] });
      queryClient.invalidateQueries({ queryKey: ['browse-sidebar-data'] });
    },
  });

  return {
    requestToBeMember: mutate,
    status,
  };
}
