'use client';

import { daoSpace } from '@geoprotocol/geo-sdk';
import { useMutation } from '@tanstack/react-query';

import { useCallback } from 'react';

import { Effect, Either } from 'effect';

import { normalizeSpaceId } from '~/core/access/space-access';
import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { useSmartAccountTransaction } from '~/core/hooks/use-smart-account-transaction';
import { getIsEditorOfSpace, getIsMemberOfSpace } from '~/core/io/queries';
import { hasActiveMemberProposal } from '~/core/io/subgraph/fetch-proposed-members';
import { useStatusBar } from '~/core/state/status-bar-store';
import { runEffectEither } from '~/core/telemetry/effect-runtime';
import { SPACE_REGISTRY_ADDRESS } from '~/core/utils/contracts/space-registry';
import { validateSpaceId } from '~/core/utils/utils';

interface UseRequestToBeMemberArgs {
  spaceId: string | null;
}

/**
 * Guards against duplicate membership requests across hook instances
 */
const inFlightOrSubmittedRequests = new Set<string>();

export function useRequestToBeMember({ spaceId }: UseRequestToBeMemberArgs) {
  const { dispatch } = useStatusBar();

  const { smartAccount } = useSmartAccount();
  const { personalSpaceId, isRegistered } = usePersonalSpaceId();

  const tx = useSmartAccountTransaction({
    address: SPACE_REGISTRY_ADDRESS,
  });

  const handleRequestToBeMember = useCallback(async () => {
    if (!smartAccount) {
      throw new Error('No smart account available');
    }

    if (!personalSpaceId || !isRegistered) {
      dispatch({
        type: 'ERROR',
        payload: 'You need a registered personal space ID to request membership',
      });
      throw new Error('User does not have a registered personal space ID');
    }

    if (!validateSpaceId(spaceId)) {
      throw new Error('Invalid target space ID');
    }

    const normalizedSpaceId = normalizeSpaceId(spaceId);
    const normalizedPersonalSpaceId = normalizeSpaceId(personalSpaceId);
    const requestKey = `${normalizedSpaceId}:${normalizedPersonalSpaceId}`;

    if (inFlightOrSubmittedRequests.has(requestKey)) {
      console.log('Membership request already in flight or submitted this session, skipping duplicate', {
        spaceId,
        personalSpaceId,
      });
      return;
    }
    inFlightOrSubmittedRequests.add(requestKey);

    try {
      // Members/editors already belong to the space; a duplicate join request errors on vote.
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

      // An active ADD_MEMBER proposal means a request is already pending
      const alreadyRequested = await hasActiveMemberProposal(normalizedSpaceId, normalizedPersonalSpaceId).catch(
        () => false
      );
      if (alreadyRequested) {
        console.log('Membership request already pending for this space, skipping duplicate', {
          spaceId,
          personalSpaceId,
        });
        return;
      }

      console.log('Requesting to be member', {
        authorSpaceId: personalSpaceId,
        spaceId,
      });

      const { calldata: callData } = daoSpace.proposeRequestMembership({
        authorSpaceId: personalSpaceId,
        spaceId,
      });

      const writeTxEffect = tx(callData).pipe(
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
          throw error;
        },
        onRight: hash => console.log('Successfully requested to be member. Transaction hash:', hash),
      });
    } catch (error) {
      inFlightOrSubmittedRequests.delete(requestKey);
      throw error;
    }
  }, [dispatch, smartAccount, personalSpaceId, isRegistered, spaceId, tx]);

  const { mutate, status } = useMutation({
    mutationFn: handleRequestToBeMember,
  });

  return {
    requestToBeMember: mutate,
    status,
  };
}
