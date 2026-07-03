'use client';

import { useMutation } from '@tanstack/react-query';

import { useCallback } from 'react';

import { Effect, Either } from 'effect';

import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { useSmartAccountTransaction } from '~/core/hooks/use-smart-account-transaction';
import { ProposalType, SubstreamVote } from '~/core/io/substream-schema';
import { geo } from '~/core/sdk/geo-client';
import { runEffectEither } from '~/core/telemetry/effect-runtime';
import { decodeGovernanceRevert } from '~/core/utils/contracts/governance-errors';
import { SPACE_REGISTRY_ADDRESS } from '~/core/utils/contracts/space-registry';
import { describeError } from '~/core/utils/error-diagnostics';
import { validateSpaceId } from '~/core/utils/utils';

/**
 * A vote can fail because the UI showed a stale proposal the chain has already
 * moved past. We divert those to a toast + refresh instead of the retry error
 * modal, which would loop forever (a stale write reverts the same way every
 * time). Everything else surfaces as a named error (see
 * {@link decodeGovernanceRevert}) so the report tells us the real cause.
 *
 * Staleness policy, by revert:
 * - CanNotVote: the vote was rejected upfront (already voted, closed, not
 *   eligible). No action runs, so it's always stale.
 * - ActionReverted: an inline action reverted. For membership proposals this is
 *   almost always "already added via a duplicate request"; for other types it
 *   can be a genuine failure, so only membership proposals treat it as stale.
 *
 * The explicit Execute button deliberately does NOT use this: an execute revert
 * surfaces its decoded reason directly, because CanNotExecute often means "needs
 * more votes to pass" or "voting period not elapsed", not "already executed" —
 * toasting "already executed" + refreshing would mislead and loop.
 */
function isMembershipProposalType(type: ProposalType): boolean {
  return type === 'ADD_MEMBER' || type === 'REMOVE_MEMBER' || type === 'ADD_EDITOR' || type === 'REMOVE_EDITOR';
}

const VOTE_NOT_ACCEPTED_MESSAGE =
  'Your vote could not be cast — voting may have ended, or your vote may already be counted. Refreshing to show the latest state.';

const MEMBERSHIP_ALREADY_APPLIED_MESSAGE =
  'This change could not be applied — it has likely already been made. Refreshing to show the latest state.';

/**
 * Toast message for a vote error caused by a stale proposal, or null when the
 * error should surface through the regular (named) error path. Callers toast the
 * message and refresh instead of raising the retry error modal.
 */
export function getStaleProposalVoteToastMessage(error: unknown, proposalType: ProposalType): string | null {
  const revert = decodeGovernanceRevert(error);
  if (revert?.name === 'CanNotVote') {
    return VOTE_NOT_ACCEPTED_MESSAGE;
  }
  if (revert?.name === 'ActionReverted' && isMembershipProposalType(proposalType)) {
    return MEMBERSHIP_ALREADY_APPLIED_MESSAGE;
  }
  return null;
}

interface UseVoteArgs {
  /** The DAO space ID (bytes16 hex without 0x prefix) where the proposal exists */
  spaceId: string;
  /** The proposal ID (bytes16 hex without 0x prefix) */
  proposalId: string;
  /** The proposal version to vote on (REST `proposalVersion`). The vote
   *  calldata is (proposalId, versionId, voteOption) — the SDK defaults
   *  versionId to 1 when omitted, which targets the superseded version for
   *  any proposal updated via PROPOSAL_UPDATED. Pass the version shown to
   *  the user; omit only when the source genuinely doesn't have it. */
  proposalVersion?: number;
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
export function useVote({ spaceId, proposalId, proposalVersion }: UseVoteArgs) {
  const { personalSpaceId, isRegistered } = usePersonalSpaceId();

  const tx = useSmartAccountTransaction();

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

      const { to, calldata } = geo.daoSpaces.voteProposal({
        authorSpaceId: personalSpaceId,
        spaceId,
        proposalId,
        versionId: proposalVersion,
        vote,
      });

      console.log('Submitting vote', {
        authorSpaceId: personalSpaceId,
        spaceId,
        proposalId,
        proposalVersion,
        vote,
        action: 'PROPOSAL_VOTED',
      });

      const txEffect = tx({ to, data: calldata }).pipe(
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
    [personalSpaceId, isRegistered, spaceId, proposalId, proposalVersion, tx]
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
