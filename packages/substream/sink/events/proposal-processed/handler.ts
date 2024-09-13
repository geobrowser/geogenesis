import { Effect } from 'effect';

import type { EditProposal } from '../proposals-created/parser';
import { Proposals } from '~/sink/db';
import type { BlockEvent } from '~/sink/types';
import { slog } from '~/sink/utils/slog';

export class ProposalDoesNotExistError extends Error {
  readonly _tag = 'ProposalDoesNotExistError';
}

export function handleProposalsProcessed(ipfsProposals: EditProposal[], block: BlockEvent) {
  return Effect.gen(function* (_) {
    slog({
      requestId: block.requestId,
      message: `Updating processed proposals to accepted`,
    });

    const dbProposals = yield* _(
      Effect.all(
        ipfsProposals.map(proposal => {
          return Effect.tryPromise({
            try: () => Proposals.setAcceptedById(proposal.proposalId),
            catch: error => {
              return new ProposalDoesNotExistError(String(error));
            },
          });
        }),
        {
          concurrency: 75,
          mode: 'either',
        }
      )
    );

    slog({
      requestId: block.requestId,
      message: `${dbProposals.length} proposals set to accepted successfully`,
    });

    // @TODO: Merge versions from the same entity into a new super version. This will require
    // writing all their ops to the new version
  });
}
