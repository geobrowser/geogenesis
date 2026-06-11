'use client';

import { useMutation } from '@tanstack/react-query';

import { useCallback } from 'react';

import { Effect, Either } from 'effect';

import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { useSmartAccountTransaction } from '~/core/hooks/use-smart-account-transaction';
import { ProposalType, SubstreamVote } from '~/core/io/substream-schema';
import { geo } from '~/core/sdk/geo-client';
import { runEffectEither } from '~/core/telemetry/effect-runtime';
import { SPACE_REGISTRY_ADDRESS } from '~/core/utils/contracts/space-registry';
import { describeError } from '~/core/utils/error-diagnostics';
import { validateSpaceId } from '~/core/utils/utils';

/**
 * DAOSpace reverts that usually mean the UI showed a stale proposal the chain
 * has already moved past. The render-time stale-request filter can't catch
 * these when the indexer lags the chain, so we detect them at vote time and
 * toast + refresh instead of surfacing raw hex (retrying would only revert
 * again). Both errors are parameterless, so we can't tell sub-cases apart —
 * the user-facing messages below must hold for every possible cause.
 */

// CanNotVote(): the DAOSpace rejected the vote upfront — the proposal already
// executed or closed, this account already voted, or it is no longer eligible
// to vote. No action runs, so treating this as stale never masks a failure.
const CAN_NOT_VOTE = { selector: '0x543ffef7', name: 'CanNotVote' };

// ActionReverted(): a deciding YES executes the proposal's actions inline and
// one of them reverted. For membership proposals this almost always means the
// change was already applied via a duplicate request. For other proposal types
// it can be a genuine execution failure, so it's only treated as stale for
// membership proposals — otherwise it surfaces as an error.
const ACTION_REVERTED = { selector: '0x24c05f9a', name: 'ActionReverted' };

function matchesRevert(error: unknown, revert: { selector: string; name: string }): boolean {
  const description = describeError(error);
  return description.includes(revert.selector) || description.includes(revert.name);
}

function isMembershipProposalType(type: ProposalType): boolean {
  return type === 'ADD_MEMBER' || type === 'REMOVE_MEMBER' || type === 'ADD_EDITOR' || type === 'REMOVE_EDITOR';
}

const VOTE_NOT_ACCEPTED_MESSAGE =
  'Your vote could not be cast — voting may have ended, or your vote may already be counted. Refreshing to show the latest state.';

const MEMBERSHIP_ALREADY_APPLIED_MESSAGE =
  'This change could not be applied — it has likely already been made. Refreshing to show the latest state.';

/**
 * Returns the toast message for a vote error caused by a stale proposal, or
 * null when the error should surface through the regular error path. Keeps the
 * detection + messaging policy in one place so every vote surface behaves the
 * same: callers toast the returned message and refresh instead of raising the
 * error modal (retrying a stale vote would only revert again).
 */
export function getStaleProposalVoteToastMessage(error: unknown, proposalType: ProposalType): string | null {
  if (matchesRevert(error, CAN_NOT_VOTE)) {
    return VOTE_NOT_ACCEPTED_MESSAGE;
  }
  if (isMembershipProposalType(proposalType) && matchesRevert(error, ACTION_REVERTED)) {
    return MEMBERSHIP_ALREADY_APPLIED_MESSAGE;
  }
  return null;
}

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
