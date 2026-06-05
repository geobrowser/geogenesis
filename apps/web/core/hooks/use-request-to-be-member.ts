'use client';

import { daoSpace } from '@geoprotocol/geo-sdk';
import { useMutation } from '@tanstack/react-query';

import { useCallback } from 'react';

import { Effect, Either } from 'effect';

import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { useSmartAccountTransaction } from '~/core/hooks/use-smart-account-transaction';
import { useStatusBar } from '~/core/state/status-bar-store';
import { runEffectEither } from '~/core/telemetry/effect-runtime';
import { SPACE_REGISTRY_ADDRESS } from '~/core/utils/contracts/space-registry';
import { validateSpaceId } from '~/core/utils/utils';

interface UseRequestToBeMemberArgs {
  /** The space ID (bytes16 hex without 0x, e.g., UUID format) of the space to join */
  spaceId: string | null;
}

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
        // Necessary to propagate error status to useMutation
        throw error;
      },
      onRight: hash => console.log('Successfully requested to be member. Transaction hash:', hash),
    });
  }, [dispatch, smartAccount, personalSpaceId, isRegistered, spaceId, tx]);

  const { mutate, status } = useMutation({
    mutationFn: handleRequestToBeMember,
  });

  return {
    requestToBeMember: mutate,
    status,
  };
}
