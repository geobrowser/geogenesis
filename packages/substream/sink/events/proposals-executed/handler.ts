import { getChecksumAddress } from '@graphprotocol/grc-20';
import { Effect } from 'effect';

import type { ProposalExecuted } from './parser';
import { Proposals } from '~/sink/db';
import type { BlockEvent } from '~/sink/types';

class CouldNotWriteExecutedProposalError extends Error {
  _tag: 'CouldNotWriteExecutedProposalError' = 'CouldNotWriteExecutedProposalError';
}

export function handleProposalsExecuted(proposalsExecuted: ProposalExecuted[], block: BlockEvent) {
  return Effect.gen(function* (_) {
    yield* _(Effect.logInfo('[PROPOSALS EXECUTED] Started'));
    yield* _(Effect.logDebug(`[PROPOSALS EXECUTED] Writing proposals: ${proposalsExecuted.length}`));

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
                block,
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

    yield* _(Effect.logInfo('[PROPOSALS EXECUTED] Ended'));
  });
}
