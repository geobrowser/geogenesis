'use client';

import { useMutation } from '@tanstack/react-query';

import { useCallback } from 'react';

import { Effect, Either } from 'effect';
import { type Hex } from 'viem';

import { normalizeSpaceId } from '~/core/access/space-access';
import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { useSmartAccountTransaction } from '~/core/hooks/use-smart-account-transaction';
import { useSpace } from '~/core/hooks/use-space';
import { getIsEditorOfSpace } from '~/core/io/queries';
import { geo } from '~/core/sdk/geo-client';
import { useStatusBar } from '~/core/state/status-bar-store';
import { runEffectEither } from '~/core/telemetry/effect-runtime';
import { SPACE_REGISTRY_ADDRESS } from '~/core/utils/contracts/space-registry';
import { validateSpaceId } from '~/core/utils/utils';

interface UseRequestToBeEditorArgs {
  /** The space ID (bytes16 hex without 0x, e.g., UUID format) of the space to become an editor of */
  spaceId: string | null;
}

export function useRequestToBeEditor({ spaceId }: UseRequestToBeEditorArgs) {
  const { dispatch } = useStatusBar();

  const { smartAccount } = useSmartAccount();
  const { personalSpaceId, isRegistered } = usePersonalSpaceId();
  const { space } = useSpace(spaceId ?? undefined);

  const tx = useSmartAccountTransaction({
    address: SPACE_REGISTRY_ADDRESS,
  });

  const handleRequestToBeEditor = useCallback(async () => {
    if (!smartAccount) {
      throw new Error('No smart account available');
    }

    if (!personalSpaceId || !isRegistered) {
      dispatch({
        type: 'ERROR',
        payload: 'You need a registered personal space ID to request editorship',
      });
      throw new Error('User does not have a registered personal space ID');
    }

    if (!validateSpaceId(spaceId)) {
      throw new Error('Invalid target space ID');
    }

    // The proposal's addEditor action must call the DAO space contract directly.
    if (!space?.address) {
      throw new Error('No space address found');
    }

    // Existing editors already belong to the space; a duplicate editor request errors on vote.
    // Check at submit time rather than via reactive access-control state, which reads false
    // while still hydrating and would let a fast click through. Fail open if the check errors.
    const access = await runEffectEither(
      getIsEditorOfSpace(normalizeSpaceId(spaceId), normalizeSpaceId(personalSpaceId))
    );
    if (Either.isRight(access) && access.right) {
      dispatch({ type: 'ERROR', payload: 'You are already an editor of this space' });
      throw new Error('User is already an editor of the space');
    }

    console.log('Requesting to be editor', {
      authorSpaceId: personalSpaceId,
      spaceId,
    });

    // Caller proposes themselves as a new editor. Editor proposals are slow-path only.
    const { calldata: callData } = geo.daoSpaces.proposeAddEditor({
      authorSpaceId: personalSpaceId,
      spaceId,
      daoSpaceAddress: space.address as Hex,
      newEditorSpaceId: personalSpaceId,
      votingMode: 'SLOW',
    });

    const writeTxEffect = tx(callData).pipe(
      Effect.withSpan('web.write.createProposal.requestEditorship'),
      Effect.annotateSpans({
        'io.operation': 'create_proposal',
        'space.type': 'DAO',
        'governance.action': 'proposal_created',
        'governance.proposal_action': 'add_editor',
        'governance.voting_mode': 'SLOW',
      })
    );

    const result = await runEffectEither(writeTxEffect);

    Either.match(result, {
      onLeft: error => {
        console.error('Failed to request editorship', { spaceId, personalSpaceId }, error);
        dispatch({ type: 'ERROR', payload: `${error}`, retry: handleRequestToBeEditor });
        // Necessary to propagate error status to useMutation
        throw error;
      },
      onRight: hash => console.log('Successfully requested to be editor. Transaction hash:', hash),
    });
  }, [dispatch, smartAccount, personalSpaceId, isRegistered, spaceId, space, tx]);

  const { mutate, status } = useMutation({
    mutationFn: handleRequestToBeEditor,
  });

  return {
    requestToBeEditor: mutate,
    status,
  };
}
