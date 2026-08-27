'use client';

import { useMutation, useQuery } from '@tanstack/react-query';

import { useCallback } from 'react';

import { Effect, Either } from 'effect';
import { type Hex, createPublicClient, http } from 'viem';

import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { useSmartAccountTransaction } from '~/core/hooks/use-smart-account-transaction';
import { geo } from '~/core/sdk/geo-client';
import {
  SPACE_REGISTRY_ADDRESS,
  assertSpaceRegistryDeployed,
  contractHasCode,
  proposalExistsOnChain,
} from '~/core/sdk/geo-network';
import { runEffectEither } from '~/core/telemetry/effect-runtime';
import { type GovernanceRevert, decodeGovernanceRevert } from '~/core/utils/contracts/governance-errors';
import {
  type ProposalExecutability,
  classifyProposalExecutability,
} from '~/core/utils/contracts/proposal-executability';
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

  const tx = useSmartAccountTransaction();

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

    // Fail closed: a registry address that doesn't match this chain produces
    // a "successful" tx that emits nothing. Catch it before sending.
    await assertSpaceRegistryDeployed();

    const { to, calldata } = geo.daoSpaces.executeProposal({
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

    const txEffect = tx({ to, data: calldata }).pipe(
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

export type { ProposalExecutability };

/**
 * Probe the live chain so the UI can tell a genuinely-executable proposal apart
 * from a stale or permanently-dead one.
 *
 * `canExecute`, status, and the membership roster all come from the indexer,
 * which lags the chain — it happily shows "Pending execution" for a proposal
 * that was already executed, for a legacy proposal whose action reverts every
 * time, or for a migrated proposal the DAO has no record of. The chain is the
 * only ground truth that separates those.
 *
 * Two signals, in order of strength:
 *
 *  1. Does the DAO know the proposal at all (`proposalExistsOnChain`)? Absence is
 *     permanent and needs no wallet, so this runs for signed-out viewers too —
 *     without it, a proposal that can never execute reads as "Pending execution"
 *     to anyone who has not connected, which is most people looking at a
 *     governance list.
 *  2. Otherwise simulate the real execute calldata, which needs a registered
 *     personal space to simulate from.
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
  const canSimulate = Boolean(account && personalSpaceId && isRegistered);

  const { data } = useQuery({
    // `account` stays in the key so connecting a wallet re-runs this and upgrades
    // a wallet-free `checking` into a real simulation.
    queryKey: ['proposal-executability', spaceId, proposalId, account],
    enabled: validateSpaceId(spaceId) && validateSpaceId(proposalId),
    // A passing result is cached briefly; a stale pass self-heals via the post-click recovery net.
    staleTime: 30_000,
    queryFn: async (): Promise<{ state: ProposalExecutability; revert: GovernanceRevert | null }> => {
      const existsOnChain = await proposalExistsOnChain(spaceId, proposalId);
      if (existsOnChain === false) {
        return { state: classifyProposalExecutability({ existsOnChain, simulationRevert: undefined }), revert: null };
      }

      if (!canSimulate) {
        return { state: 'checking', revert: null };
      }

      const { calldata } = geo.daoSpaces.executeProposal({
        authorSpaceId: personalSpaceId!,
        spaceId,
        proposalId,
      });

      const publicClient = createPublicClient({ chain: GEOGENESIS, transport: http() });

      // An eth_call against an address with no code "succeeds" with empty
      // data — indistinguishable from a passing simulation. Fail closed to
      // `blocked` (button hidden) instead of reporting a phantom `executable`.
      if (!(await contractHasCode(SPACE_REGISTRY_ADDRESS as Hex))) {
        return { state: 'blocked', revert: null };
      }

      try {
        await publicClient.call({ account: account as Hex, to: SPACE_REGISTRY_ADDRESS as Hex, data: calldata });
        return { state: classifyProposalExecutability({ existsOnChain, simulationRevert: null }), revert: null };
      } catch (error) {
        const revert = decodeGovernanceRevert(error);
        return { state: classifyProposalExecutability({ existsOnChain, simulationRevert: revert }), revert };
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
