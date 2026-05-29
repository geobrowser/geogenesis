'use client';

import { useMutation } from '@tanstack/react-query';

import { useCallback } from 'react';

import { Effect, Either } from 'effect';

import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { useSmartAccountTransaction } from '~/core/hooks/use-smart-account-transaction';
import { geo } from '~/core/sdk/geo-client';
import { runEffectEither } from '~/core/telemetry/effect-runtime';
import { SPACE_REGISTRY_ADDRESS } from '~/core/utils/contracts/space-registry';
import { validateSpaceId } from '~/core/utils/utils';

interface UseExecuteProposalArgs {
  /** The DAO space ID (bytes16 hex without 0x prefix) where the proposal exists */
  spaceId: string;
  /** The proposal ID (bytes16 hex without 0x prefix) */
  proposalId: string;
}

/**
 * Hook for executing a passed proposal in the new protocol.
 *
 * Execution is triggered by calling SpaceRegistry.enter() with:
 * - fromSpaceId: The executor's personal space ID
 * - toSpaceId: The DAO space ID where the proposal exists
 * - action: GOVERNANCE_ACTIONS.PROPOSAL_EXECUTED
 * - topic: The proposal ID (as bytes32)
 * - data: Encoded (proposalId)
 *
 * Note: Anyone can execute a proposal once it has passed the support threshold.
 */
export function useExecuteProposal({ spaceId, proposalId }: UseExecuteProposalArgs) {
  const { personalSpaceId, isRegistered } = usePersonalSpaceId();

  const tx = useSmartAccountTransaction({
    address: SPACE_REGISTRY_ADDRESS,
  });

  const handleExecute = useCallback(async () => {
    if (!validateSpaceId(spaceId)) {
      throw new Error('Invalid space ID format. Cannot execute proposal.');
    }

    if (!validateSpaceId(proposalId)) {
      throw new Error('Invalid proposal ID format. Cannot execute proposal.');
    }

    if (!personalSpaceId || !isRegistered) {
      throw new Error('You need a registered personal space to execute proposals');
    }

    const { calldata: callData } = geo.daoSpaces.proposals.execute({
      authorSpaceId: personalSpaceId,
      spaceId,
      proposalId,
    });

    console.log('Executing proposal', {
      authorSpaceId: personalSpaceId,
      spaceId,
      proposalId,
      action: 'PROPOSAL_EXECUTED',
    });

    const txEffect = tx(callData).pipe(
      Effect.withSpan('web.write.executeProposal'),
      Effect.annotateSpans({
        'io.operation': 'execute_proposal',
        'space.type': 'DAO',
        'governance.action': 'proposal_executed',
      })
    );
    const result = await runEffectEither(txEffect);

    if (Either.isLeft(result)) {
      const error = result.left;
      console.error(`Execute failed: ${error.message}`, { authorSpaceId: personalSpaceId, spaceId, proposalId }, error);
      throw error;
    }

    console.log('Execute successful', {
      txHash: result.right,
      authorSpaceId: personalSpaceId,
      spaceId,
      proposalId,
    });

    return result.right;
  }, [personalSpaceId, isRegistered, spaceId, proposalId, tx]);

  const { mutate, status, error, reset } = useMutation({
    mutationFn: handleExecute,
  });

  return {
    execute: mutate,
    status,
    error,
    reset,
  };
}
