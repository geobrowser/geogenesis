import { Effect } from 'effect';
import * as db from 'zapatos/db';

import type { ProposalExecuted } from './parser';
import { Spaces } from '~/sink/db';
import type { BlockEvent } from '~/sink/types';
import { pool } from '~/sink/utils/pool';
import { slog } from '~/sink/utils/slog';

export function handleProposalsExecuted(proposalsExecuted: ProposalExecuted[], block: BlockEvent) {
  return Effect.gen(function* (_) {
    const proposals = proposalsExecuted;

    slog({
      requestId: block.cursor,
      message: `Updating ${proposals.length} proposals after execution`,
    });

    yield* _(
      Effect.all(
        proposalsExecuted.map(proposal => {
          return Effect.tryPromise({
            try: async () => {
              // @TODO: There might be executed proposals coming from both the member access plugin
              // and the voting plugin, so we need to handle both cases.
              //
              // Alternatively we use the `Approved` event to update events coming from the member
              // access plugin. I'm not sure if overloading the ProposalExecuted event for multiple
              // proposal types is better than using unique events for each proposal type.
              const space = await Spaces.findForVotingPlugin(proposal.pluginAddress);

              if (space) {
                return await db
                  .update(
                    'proposals',
                    { status: 'accepted' },
                    // @TODO: There might be multiple proposals with the same onchain_proposal_id
                    // if there are proposals from both the voting plugin and the member access plugin.
                    { onchain_proposal_id: proposal.proposalId, space_id: space, type: 'CONTENT' }
                  )
                  .run(pool);
              }
            },
            catch: error => {
              slog({
                requestId: block.cursor,
                message: `Failed to update executed proposal ${proposal.proposalId} from voting plugin ${
                  proposal.pluginAddress
                } ${String(error)}`,
                level: 'error',
              });
            },
          });
        })
      )
    );

    slog({
      requestId: block.cursor,
      message: `${proposals.length} proposals updated successfully!`,
    });
  });
}
