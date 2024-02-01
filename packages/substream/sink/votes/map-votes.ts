import { Effect } from 'effect';
import * as db from 'zapatos/db';
import type * as S from 'zapatos/schema';

import {
  ProposalWithOnchainProposalIdAndSpaceIdNotFoundError,
  type SpaceWithPluginAddressNotFoundError,
} from '../errors';
import { slog } from '../utils';
import { getChecksumAddress } from '../utils/get-checksum-address';
import { getSpaceForVotingPlugin } from '../utils/get-space-for-voting-plugin';
import { pool } from '../utils/pool';
import type { Vote } from '../zod';

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
  votes: Vote[],
  blockNumber: number,
  timestamp: number
): Effect.Effect<
  never,
  ProposalWithOnchainProposalIdAndSpaceIdNotFoundError | SpaceWithPluginAddressNotFoundError,
  S.proposal_votes.Insertable[]
> {
  return Effect.gen(function* (unwrap) {
    const schemaVotes: S.proposal_votes.Insertable[] = [];

    for (const vote of votes) {
      const voteType = getVoteTypeAsText(vote.voteOption);

      if (!voteType) {
        slog({
          message: `Vote type is invalid ${vote.voteOption} for vote ${vote.onchainProposalId} in space ${vote.pluginAddress}, skipping indexing the vote.`,
          requestId: '-1',
        });

        continue;
      }

      const maybeSpaceIdForPlugin = yield* unwrap(getSpaceForVotingPlugin(getChecksumAddress(vote.pluginAddress)));

      if (!maybeSpaceIdForPlugin) {
        slog({
          message: `Matching space in Proposal not found for plugin address ${vote.pluginAddress}`,
          requestId: '-1',
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
          message: `Matching proposal not found for onchain proposal id ${vote.onchainProposalId} in space ${maybeSpaceIdForPlugin}`,
          requestId: '-1',
        });

        continue;
      }

      schemaVotes.push({
        id: Math.random().toString(36).substring(7),
        vote: voteType,
        space_id: maybeSpaceIdForPlugin,
        proposal_id: maybeProposal.id,
        onchain_proposal_id: vote.onchainProposalId,
        account_id: getChecksumAddress(vote.voter),
        created_at: timestamp,
        created_at_block: blockNumber,
      });
    }

    return schemaVotes;
  });
}

function getVoteTypeAsText(voteType: Vote['voteOption']): S.vote_type | null {
  switch (Number(voteType)) {
    case 0:
      return null;
    case 1:
      return null;
    case 2:
      return 'yes';
    case 3:
      return 'no';
    default:
      return null;
  }
}
