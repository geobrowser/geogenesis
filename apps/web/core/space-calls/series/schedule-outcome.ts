import { Effect } from 'effect';

import { getSpace } from '~/core/io/queries';
import { isProposalExecuted } from '~/core/utils/contracts/proposal-execution';

/**
 * What a confirmed schedule publish left on the graph (GEO-3420). `usePublish` reports success
 * once the proposal is created, even when its auto-execute failed, so this reads the chain.
 * - `executed`: the call is on the graph.
 * - `pending`: the proposal waits on governance.
 * - `unknown`: the chain could not be read.
 */
export type ScheduleOutcome = 'executed' | 'pending' | 'unknown';

export async function readScheduleOutcome({
  spaceId,
  proposalId,
  readSpace = id => Effect.runPromise(getSpace(id)),
  readExecuted = isProposalExecuted,
}: {
  spaceId: string;
  /** The id passed to `makeProposal`, 32 hex characters. */
  proposalId: string;
  readSpace?: (spaceId: string) => Promise<{ type: string; address: string } | null>;
  readExecuted?: typeof isProposalExecuted;
}): Promise<ScheduleOutcome> {
  const space = await readSpace(spaceId).catch(() => null);
  if (!space) return 'unknown';
  // A personal space publishes directly, with no proposal.
  if (space.type !== 'DAO') return 'executed';
  const executed = await readExecuted({
    daoSpaceAddress: space.address as `0x${string}`,
    proposalId: `0x${proposalId}`,
  });
  return executed === null ? 'unknown' : executed ? 'executed' : 'pending';
}
