import { getChecksumAddress } from '@geogenesis/sdk';
import { Effect } from 'effect';

import type { ProposalExecuted } from './parser';
import { Proposals } from '~/sink/db';

class CouldNotWriteExecutedProposalError extends Error {
  _tag: 'CouldNotWriteExecutedProposalError' = 'CouldNotWriteExecutedProposalError';
}

export function handleProposalsExecuted(proposalsExecuted: ProposalExecuted[]) {
  return Effect.gen(function* (_) {
    yield* _(Effect.logInfo('Handling proposals executed'));
    yield* _(Effect.logDebug(`Updating proposal statuses for ${proposalsExecuted.length} proposals`));

    // @TODO: Batch update proposals in one insert instead of iteratively
    yield* _(
      Effect.forEach(
        proposalsExecuted,
        proposal => {
          return Effect.tryPromise({
            try: async () => {
              return await Proposals.setAccepted({
                onchainProposalId: proposal.proposalId,
                pluginAddress: getChecksumAddress(proposal.pluginAddress),
              });
            },
            catch: error => {
              return new CouldNotWriteExecutedProposalError(String(error));
            },
          });
        },
        {
          concurrency: 50,
        }
      )
    );

    yield* _(Effect.logInfo('Proposal state updated'));
  });
}
