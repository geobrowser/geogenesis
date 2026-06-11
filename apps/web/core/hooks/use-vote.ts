'use client';

import { useMutation } from '@tanstack/react-query';

import { useCallback } from 'react';

import { Effect, Either } from 'effect';

import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { useSmartAccountTransaction } from '~/core/hooks/use-smart-account-transaction';
import { SubstreamVote } from '~/core/io/substream-schema';
import { geo } from '~/core/sdk/geo-client';
import { runEffectEither } from '~/core/telemetry/effect-runtime';
import { SPACE_REGISTRY_ADDRESS } from '~/core/utils/contracts/space-registry';
import { describeError } from '~/core/utils/error-diagnostics';
import { validateSpaceId } from '~/core/utils/utils';

/**
 * DAOSpace reverts that mean the vote arrived too late — the UI showed a stale
 * proposal the chain has already moved past. The render-time stale-request
 * filter can't catch these when the indexer lags the chain, so we detect them
 * at vote time and refresh instead of surfacing raw hex (retrying would only
 * revert again).
 */
const STALE_PROPOSAL_REVERTS = [
  // ActionReverted(): a deciding YES executes the proposal's actions in the
  // same transaction; for membership proposals this almost always means the
  // target was already added through a duplicate request.
  { selector: '0x24c05f9a', name: 'ActionReverted' },
  // CanNotVote(): the proposal already executed/closed, or this account
  // already voted — e.g. a second Accept on a card that didn't re-render.
  { selector: '0x543ffef7', name: 'CanNotVote' },
];

export function isStaleProposalVoteError(error: unknown): boolean {
  const description = describeError(error);
  return STALE_PROPOSAL_REVERTS.some(r => description.includes(r.selector) || description.includes(r.name));
}

export const STALE_PROPOSAL_VOTE_ERROR_MESSAGE =
  'This proposal was already completed, so your vote was no longer needed. Refreshing the list.';

interface UseVoteArgs {
  /** The DAO space ID (bytes16 hex without 0x prefix) where the proposal exists */
  spaceId: string;
  /** The proposal ID (bytes16 hex without 0x prefix) */
  proposalId: string;
}

/**
 * Hook for voting on a proposal in the new protocol.
 *
 * Votes are cast by calling SpaceRegistry.enter() with:
 * - fromSpaceId: The voter's personal space ID
 * - toSpaceId: The DAO space ID where the proposal exists
 * - action: GOVERNANCE_ACTIONS.PROPOSAL_VOTED
 * - topic: The proposal ID (as bytes32)
 * - data: Encoded (proposalId, voteOption)
 */
export function useVote({ spaceId, proposalId }: UseVoteArgs) {
  const { personalSpaceId, isRegistered } = usePersonalSpaceId();

  const tx = useSmartAccountTransaction({
    address: SPACE_REGISTRY_ADDRESS,
  });

  const handleVote = useCallback(
    async (option: SubstreamVote['vote']) => {
      if (!validateSpaceId(spaceId)) {
        throw new Error('Invalid space ID format. Cannot submit vote.');
      }

      if (!validateSpaceId(proposalId)) {
        throw new Error('Invalid proposal ID format. Cannot submit vote.');
      }

      if (!personalSpaceId || !isRegistered) {
        throw new Error('You need a registered personal space to vote');
      }

      const vote = option === 'ACCEPT' ? 'YES' : option === 'REJECT' ? 'NO' : 'ABSTAIN';

      const { calldata: callData } = geo.daoSpaces.proposals.vote({
        authorSpaceId: personalSpaceId,
        spaceId,
        proposalId,
        vote,
      });

      console.log('Submitting vote', {
        authorSpaceId: personalSpaceId,
        spaceId,
        proposalId,
        vote,
        action: 'PROPOSAL_VOTED',
      });

      const txEffect = tx(callData).pipe(
        Effect.withSpan('web.write.vote'),
        Effect.annotateSpans({
          'io.operation': 'vote',
          'space.type': 'DAO',
          'governance.action': 'proposal_voted',
        })
      );
      const result = await runEffectEither(txEffect);

      if (Either.isLeft(result)) {
        const error = result.left;
        console.error(
          `Vote failed: ${error.message}`,
          { authorSpaceId: personalSpaceId, spaceId, proposalId, vote },
          error
        );
        throw error;
      }

      console.log('Vote successful', {
        txHash: result.right,
        authorSpaceId: personalSpaceId,
        spaceId,
        proposalId,
        vote,
      });

      return result.right;
    },
    [personalSpaceId, isRegistered, spaceId, proposalId, tx]
  );

  const { mutate, status, error } = useMutation({
    mutationFn: handleVote,
  });

  return {
    vote: mutate,
    status,
    error,
  };
}
