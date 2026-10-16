'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useCallback } from 'react';

import { Effect, Either } from 'effect';

import { requestSpaceMembership } from '~/core/access/request-space-membership';
import { normalizeSpaceId } from '~/core/access/space-access';
import { useActionContext } from '~/core/action-context-provider';
import { readCachedSmartAccount, readRegisteredPersonalSpaceId } from '~/core/hooks/cached-write-identity';
import { useObservedMutation } from '~/core/hooks/use-observed-mutation';
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

type RequestToBeMemberOptions = {
  /** Replaying a request queued before the account was ready (see `useJoinSpace`). */
  fromQueue?: boolean;
  /** For a replay: whether its press is still the one queued, re-checked after the membership read. */
  isCurrent?: () => boolean;
};

export function useRequestToBeMember({ spaceId, space }: UseRequestToBeMemberArgs) {
  const getContext = useActionContext('join_space_button', 'space', spaceId ?? '');
  const { dispatch } = useStatusBar();

  const { smartAccount } = useSmartAccount();
  const { personalSpaceId, isRegistered } = usePersonalSpaceId();
  const { isPending: isAccountSetupPending } = usePendingPersonalSpace();
  const queryClient = useQueryClient();

  const tx = useSmartAccountTransaction();

  const handleRequestToBeMember = useCallback(
    async ({ fromQueue = false, isCurrent = () => true }: RequestToBeMemberOptions = {}) => {
      // Through the cache as well as this render. A join queued before sign-up replays through this
      // hook as it was at the press, before the account or space existed; the cache has both by the
      // time the runner fires. Reading only the render failed that replay on every retry.
      const account = readCachedSmartAccount(queryClient, smartAccount);
      if (!account) {
        throw new Error('No smart account available');
      }

      const requesterSpaceId = readRegisteredPersonalSpaceId(queryClient, account.account.address, {
        personalSpaceId,
        isRegistered,
      });

      if (!requesterSpaceId) {
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
      const normalizedPersonalSpaceId = normalizeSpaceId(requesterSpaceId);
      const access = await runEffectEither(
        Effect.all([
          getIsMemberOfSpace(normalizedSpaceId, normalizedPersonalSpaceId),
          getIsEditorOfSpace(normalizedSpaceId, normalizedPersonalSpaceId),
        ])
      );
      // Cleared (a sign-out) or replaced during that read: the request must not follow.
      if (!isCurrent()) return;
      if (Either.isRight(access) && (access.right[0] || access.right[1])) {
        // What the queued request was for is already true — a returning member who pressed Join while
        // signed out. Done, not failed: throwing kept it queued and the button "requested" for good.
        if (fromQueue) return;
        dispatch({ type: 'ERROR', payload: 'You are already a member of this space' });
        throw new Error('User is already a member or editor of the space');
      }

      try {
        await requestSpaceMembership({ spaceId, personalSpaceId: requesterSpaceId, tx, queryClient, space });
      } catch (error) {
        dispatch({ type: 'ERROR', payload: `${error}`, retry: () => handleRequestToBeMember() });
        // Necessary to propagate error status to useMutation
        throw error;
      }
    },
    [dispatch, smartAccount, personalSpaceId, isRegistered, isAccountSetupPending, spaceId, space, tx, queryClient]
  );

  const mutation = useMutation({
    // `void` as well, so a live press can still call `mutate()` with nothing.
    mutationFn: (options: RequestToBeMemberOptions | void) => handleRequestToBeMember(options ?? undefined),
  });
  const { mutate, mutateAsync, status } = useObservedMutation(mutation, 'join_space', () => getContext());

  return {
    requestToBeMember: mutate,
    requestToBeMemberAsync: mutateAsync,
    status,
  };
}
