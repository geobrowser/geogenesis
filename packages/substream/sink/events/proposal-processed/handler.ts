import { Effect, Either } from 'effect';

import type { EditProposal } from '../proposals-created/parser';
import { Proposals } from '~/sink/db';
import { populateApprovedContentProposal } from '~/sink/entries/populate-approved-content-proposal';
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

    const ipfsProposalsWithExistingDbProposal = dbProposals.flatMap(maybeProposal => {
      if (Either.isLeft(maybeProposal)) {
        slog({
          requestId: block.requestId,
          message: `Failed to read proposal from DB ${maybeProposal.left}`,
          level: 'error',
        });

        return [];
      }

      if (maybeProposal.right[0]) {
        return [maybeProposal.right[0]];
      }

      slog({
        requestId: block.requestId,
        message: `Failed to read proposal from DB for unknown reason`,
        level: 'error',
      });

      return [];
    });

    const proposals = ipfsProposals.filter(ipfs =>
      ipfsProposalsWithExistingDbProposal.some(p => p.id === ipfs.proposalId)
    );

    slog({
      requestId: block.requestId,
      message: `${proposals.length} proposals set to accepted successfully`,
    });

    slog({
      requestId: block.requestId,
      message: `Writing data for ${proposals.length} processed proposals`,
    });

    // @TODO(performance):
    // We store the proposal data and ops in the DB already, so we can read the
    // content of the ipfs proposals directly from the db instead of fetching
    // from IPFS again.
    yield* _(populateApprovedContentProposal(proposals, block));

    slog({
      requestId: block.requestId,
      message: 'Processed proposals written successfully!',
    });
  });
}
