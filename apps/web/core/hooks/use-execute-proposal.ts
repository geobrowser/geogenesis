'use client';

import { useMutation, useQuery } from '@tanstack/react-query';

import { useCallback } from 'react';

import { Effect, Either } from 'effect';
import { type Hex, createPublicClient, http } from 'viem';

import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { useSmartAccountTransaction } from '~/core/hooks/use-smart-account-transaction';
import { geo } from '~/core/sdk/geo-client';
import { runEffectEither } from '~/core/telemetry/effect-runtime';
import {
  ACTION_REVERTED_SELECTOR,
  type GovernanceRevert,
  decodeGovernanceRevert,
} from '~/core/utils/contracts/governance-errors';
import { SPACE_REGISTRY_ADDRESS } from '~/core/utils/contracts/space-registry';
import { validateSpaceId } from '~/core/utils/utils';
import { GEOGENESIS } from '~/core/wallet/geo-chain';

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

/**
 * Whether a passed proposal can actually be executed on-chain, and if not, why.
 *
 * - `checking`   — still simulating (or no registered account to simulate from)
 * - `executable` — the execute call would succeed
 * - `dead`       — the proposal's own action reverts (ActionReverted); it can
 *                  never execute and must be recreated (legacy malformed proposal)
 * - `blocked`    — some other governance revert (already executed, not enough
 *                  votes, voting period not elapsed) — transient or resolved
 */
export type ProposalExecutability = 'checking' | 'executable' | 'dead' | 'blocked';

/**
 * Simulate the real execute calldata against the live chain so the UI can tell a
 * genuinely-executable proposal apart from a stale or permanently-dead one.
 *
 * `canExecute`, status, and the membership roster all come from the indexer,
 * which lags the chain — it happily shows "Pending execution" for a proposal
 * that was already executed OR for a legacy proposal whose action reverts every
 * time. The simulation is the only ground truth that separates those.
 *
 * A non-revert failure (slow/unreachable RPC, unknown revert) resolves to
 * `executable` so a flaky RPC never permanently hides a legitimate action.
 */
export function useProposalExecutability({ spaceId, proposalId }: UseExecuteProposalArgs): {
  state: ProposalExecutability;
  revert: GovernanceRevert | null;
} {
  const { personalSpaceId, isRegistered } = usePersonalSpaceId();
  const { smartAccount } = useSmartAccount();
  const account = smartAccount?.account.address;

  const { data } = useQuery({
    queryKey: ['proposal-executability', spaceId, proposalId, account],
    enabled: Boolean(
      account && personalSpaceId && isRegistered && validateSpaceId(spaceId) && validateSpaceId(proposalId)
    ),
    // A passing result is cached briefly; a stale pass self-heals via the post-click recovery net.
    staleTime: 30_000,
    queryFn: async (): Promise<{ state: ProposalExecutability; revert: GovernanceRevert | null }> => {
      const { calldata } = geo.daoSpaces.proposals.execute({
        authorSpaceId: personalSpaceId!,
        spaceId,
        proposalId,
      });

      const publicClient = createPublicClient({ chain: GEOGENESIS, transport: http() });

      try {
        await publicClient.call({ account: account as Hex, to: SPACE_REGISTRY_ADDRESS as Hex, data: calldata });
        return { state: 'executable', revert: null };
      } catch (error) {
        const revert = decodeGovernanceRevert(error);
        // Unknown / RPC error: fail open so we never hide a valid action.
        if (revert === null) return { state: 'executable', revert: null };
        const state = revert.selector === ACTION_REVERTED_SELECTOR ? 'dead' : 'blocked';
        return { state, revert };
      }
    },
  });

  return data ?? { state: 'checking', revert: null };
}

/**
 * Tri-state convenience wrapper around {@link useProposalExecutability}:
 * - `undefined` — still checking
 * - `true`      — execution would succeed
 * - `false`     — execution would revert (dead / blocked)
 */
export function useCanExecuteProposal(args: UseExecuteProposalArgs): boolean | undefined {
  const { state } = useProposalExecutability(args);
  if (state === 'checking') return undefined;
  return state === 'executable';
}
