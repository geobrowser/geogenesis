import { Effect, Either } from 'effect';
import * as db from 'zapatos/db';

import type { ProposalExecuted } from './parser';
import { Proposals } from '~/sink/db';
import { Telemetry } from '~/sink/telemetry';
import type { BlockEvent } from '~/sink/types';
import { getChecksumAddress } from '~/sink/utils/get-checksum-address';
import { pool } from '~/sink/utils/pool';
import { slog } from '~/sink/utils/slog';

class CouldNotWriteExecutedProposalError extends Error {
  _tag: 'CouldNotWriteExecutedProposalError' = 'CouldNotWriteExecutedProposalError';
}

export function handleProposalsExecuted(proposalsExecuted: ProposalExecuted[], block: BlockEvent) {
  return Effect.gen(function* (_) {
    const telemetry = yield* _(Telemetry);
    const proposals = proposalsExecuted;

    slog({
      requestId: block.requestId,
      message: `Updating ${proposals.length} proposals after execution`,
    });

    // @TODO: Batch update proposals in one insert instead of iteratively
    const writtenExecutedProposals = yield* _(
      Effect.all(
        proposalsExecuted.map(proposal => {
          return Effect.tryPromise({
            try: async () => {
              // There might be executed proposals coming from both the member access plugin
              // and the voting plugin, so we need to handle both cases. Each plugin contract keeps
              // of its own onchain ids, so there might be clashes between onchain ids for proposals
              // created in different plugins.
              //
              // A proposal stores the plugin address that created the proposal so we can disambiguate
              // when we update the proposals here.
              const [isContentProposal, isAddSubspaceProposal] = await Promise.all([
                Proposals.getOne({
                  onchainProposalId: proposal.proposalId,
                  pluginAddress: getChecksumAddress(proposal.pluginAddress),
                  type: 'CONTENT',
                }),
                Proposals.getOne({
                  onchainProposalId: proposal.proposalId,
                  pluginAddress: getChecksumAddress(proposal.pluginAddress),
                  type: 'ADD_SUBSPACE',
                }),
              ]);

              if (isContentProposal) {
                return await Proposals.setAccepted({
                  onchainProposalId: proposal.proposalId,
                  pluginAddress: getChecksumAddress(proposal.pluginAddress),
                  type: 'CONTENT',
                });
              }

              if (isAddSubspaceProposal) {
                return await Proposals.setAccepted({
                  onchainProposalId: proposal.proposalId,
                  pluginAddress: getChecksumAddress(proposal.pluginAddress),
                  type: 'ADD_SUBSPACE',
                });
              }

              const isAddMemberProposal = await Proposals.getOne({
                onchainProposalId: proposal.proposalId,
                pluginAddress: getChecksumAddress(proposal.pluginAddress),
                type: 'ADD_MEMBER',
              });

              if (isAddMemberProposal) {
                return await Proposals.setAccepted({
                  onchainProposalId: proposal.proposalId,
                  pluginAddress: getChecksumAddress(proposal.pluginAddress),
                  type: 'ADD_MEMBER',
                });
              }
            },
            catch: error => {
              return new CouldNotWriteExecutedProposalError(String(error));
            },
          });
        }),
        {
          mode: 'either',
        }
      )
    );

    // @TODO: Batch update proposals in one insert instead of iteratively
    for (const writtenExecutedProposal of writtenExecutedProposals) {
      if (Either.isLeft(writtenExecutedProposal)) {
        const error = writtenExecutedProposal.left;
        telemetry.captureException(error);

        slog({
          level: 'error',
          requestId: block.requestId,
          message: `Could not write executed proposal
            Cause: ${error.cause}
            Message: ${error.message}
          `,
        });

        continue;
      }
    }
  });
}
