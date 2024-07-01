import { Effect } from 'effect';
import * as db from 'zapatos/db';
import type * as S from 'zapatos/schema';

import type { VoteCast } from './parser';
import { Spaces } from '~/sink/db';
import {
  ProposalWithOnchainProposalIdAndSpaceIdNotFoundError,
  type SpaceWithPluginAddressNotFoundError,
} from '~/sink/errors';
import type { GeoBlock } from '~/sink/types';
import { getChecksumAddress } from '~/sink/utils/get-checksum-address';
import { pool } from '~/sink/utils/pool';
import { slog } from '~/sink/utils/slog';

/**
 * Proposals represent a proposal to change the state of a DAO-based space. Proposals can
 * represent changes to content, membership (editor or member), governance changes, subspace
 * membership, or anything else that can be executed by a DAO.
 *
 * Currently we use a simple majority voting model, where a proposal requires 51% of the
 * available votes in order to pass. Only editors are allowed to vote on proposals, but editors
 * _and_ members can create them.
 */
export function mapVotes(
  votes: VoteCast[],
  block: GeoBlock
): Effect.Effect<
  S.proposal_votes.Insertable[],
  ProposalWithOnchainProposalIdAndSpaceIdNotFoundError | SpaceWithPluginAddressNotFoundError,
  never
> {
  return Effect.gen(function* (unwrap) {
    const schemaVotes: S.proposal_votes.Insertable[] = [];

    for (const vote of votes) {
      const voteType = getVoteTypeAsText(vote.voteOption);

      if (!voteType) {
        slog({
          level: 'error',
          message: `Vote type is invalid ${vote.voteOption} for vote ${vote.onchainProposalId} in space ${vote.pluginAddress}, skipping indexing the vote.`,
          requestId: block.requestId,
        });

        continue;
      }

      const maybeSpaceIdForPlugin = yield* unwrap(Effect.promise(() => Spaces.findForVotingPlugin(vote.pluginAddress)));

      if (!maybeSpaceIdForPlugin) {
        slog({
          message: `Matching space in Proposal not found for plugin address ${vote.pluginAddress}`,
          requestId: block.requestId,
        });

        continue;
      }

      const maybeProposal = yield* unwrap(
        Effect.tryPromise({
          try: () =>
            db
              .selectOne(
                'proposals',
                { onchain_proposal_id: vote.onchainProposalId, space_id: maybeSpaceIdForPlugin },
                { columns: ['id'] }
              )
              .run(pool),
          catch: error => new ProposalWithOnchainProposalIdAndSpaceIdNotFoundError(String(error)),
        })
      );

      if (!maybeProposal) {
        slog({
          level: 'error',
          message: `Matching proposal not found for onchain proposal id ${vote.onchainProposalId} in space ${maybeSpaceIdForPlugin}`,
          requestId: block.requestId,
        });

        continue;
      }

      schemaVotes.push({
        vote: voteType,
        space_id: maybeSpaceIdForPlugin,
        proposal_id: maybeProposal.id,
        onchain_proposal_id: vote.onchainProposalId,
        account_id: getChecksumAddress(vote.voter),
        created_at: block.timestamp,
        created_at_block: block.blockNumber,
      });
    }

    return schemaVotes;
  });
}

function getVoteTypeAsText(voteType: VoteCast['voteOption']): S.vote_type | null {
  switch (Number(voteType)) {
    case 0:
      return null;
    case 1:
      return null;
    case 2:
      return 'accept';
    case 3:
      return 'reject';
    default:
      return null;
  }
}
