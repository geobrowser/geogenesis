'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useCallback } from 'react';

import { Effect, Either } from 'effect';

import { requestSpaceMembership } from '~/core/access/request-space-membership';
import { normalizeSpaceId } from '~/core/access/space-access';
import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { useSmartAccountTransaction } from '~/core/hooks/use-smart-account-transaction';
import { getIsEditorOfSpace, getIsMemberOfSpace } from '~/core/io/queries';
import { usePendingPersonalSpace } from '~/core/state/pending-personal-space';
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

    try {
      await requestSpaceMembership({ spaceId, personalSpaceId, tx, queryClient, space });
    } catch (error) {
      dispatch({ type: 'ERROR', payload: `${error}`, retry: handleRequestToBeMember });
      // Necessary to propagate error status to useMutation
      throw error;
    }
  }, [dispatch, smartAccount, personalSpaceId, isRegistered, isAccountSetupPending, spaceId, space, tx, queryClient]);

  const { mutate, status } = useMutation({ mutationFn: handleRequestToBeMember });

  return {
    requestToBeMember: mutate,
    status,
  };
}
