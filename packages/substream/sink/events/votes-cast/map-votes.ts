import { Effect } from 'effect';
import * as db from 'zapatos/db';
import type * as S from 'zapatos/schema';

import type { VoteCast } from './parser';
import { Spaces } from '~/sink/db';
import {
  ProposalWithOnchainProposalIdAndSpaceIdNotFoundError,
  type SpaceWithPluginAddressNotFoundError,
} from '~/sink/errors';
import type { BlockEvent } from '~/sink/types';
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
  block: BlockEvent
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

      // We have multiple plugins on a governance space that keep their own proposal id state onchain.
      // Each plugin's ids are incrementing integers. This means we can have proposals across each plugin
      // with the same onchain id. We need to query all the proposals with the same onchain id in the
      // space and disambiguate which proposal we are actually referring to by the action being proposed
      // and the plugin itself. e.g., if we know the proposal is an ADD_EDIT then we know that we're
      // looking for the proposal where the plugin address is the voting one.
      //
      // At most we have X proposals with the same onchain where X is the number of plugins in the DAO
      // that track proposal state onchain.
      //
      // If maybeSpaceIdForVotingPlugin returns data we know that the vote corresponds to a voting action.
      // Same for maybeSpaceIdForMemberPlugin.
      const [maybeSpaceIdForVotingPlugin, maybeSpaceIdForMemberPlugin] = yield* unwrap(
        Effect.all([
          Effect.promise(() => Spaces.findForVotingPlugin(vote.pluginAddress)),
          Effect.promise(() => Spaces.findForMembershipPlugin(vote.pluginAddress)),
        ])
      );

      if (!maybeSpaceIdForVotingPlugin && !maybeSpaceIdForMemberPlugin) {
        slog({
          message: `Matching space in Proposal not found for plugin address ${vote.pluginAddress}`,
          requestId: block.requestId,
        });

        continue;
      }

      if (maybeSpaceIdForVotingPlugin) {
        slog({
          requestId: block.requestId,
          level: 'info',
          message: `Verifying proposal id for voting plugin with address ${vote.pluginAddress}`,
        });

        const maybeProposalsForOnchainProposalId = yield* unwrap(
          Effect.tryPromise({
            try: () =>
              db
                .select(
                  'proposals',

                  { onchain_proposal_id: vote.onchainProposalId, space_id: maybeSpaceIdForVotingPlugin },
                  { columns: ['id', 'type'] }
                )
                .run(pool),
            catch: error => new ProposalWithOnchainProposalIdAndSpaceIdNotFoundError(String(error)),
          })
        );

        const proposalIdForAction = maybeProposalsForOnchainProposalId.find(p => p.type !== 'ADD_MEMBER');

        if (!proposalIdForAction) {
          slog({
            level: 'error',
            message: `Matching proposal not found for onchain proposal id ${vote.onchainProposalId} in space ${maybeSpaceIdForVotingPlugin}`,
            requestId: block.requestId,
          });

          continue;
        }

        schemaVotes.push({
          vote: voteType,
          space_id: maybeSpaceIdForVotingPlugin,
          proposal_id: proposalIdForAction.id,
          onchain_proposal_id: vote.onchainProposalId,
          account_id: getChecksumAddress(vote.voter),
          created_at: block.timestamp,
          created_at_block: block.blockNumber,
        });

        continue;
      }

      if (maybeSpaceIdForMemberPlugin) {
        slog({
          requestId: block.requestId,
          level: 'info',
          message: `Verifying proposal id for membership plugin with address ${vote.pluginAddress}`,
        });

        const maybeProposalsForMemberPlugin = yield* unwrap(
          Effect.tryPromise({
            try: () =>
              db
                .select(
                  'proposals',
                  { onchain_proposal_id: vote.onchainProposalId, space_id: maybeSpaceIdForMemberPlugin },
                  { columns: ['id', 'type'] }
                )
                .run(pool),
            catch: error => new ProposalWithOnchainProposalIdAndSpaceIdNotFoundError(String(error)),
          })
        );

        const proposalIdForAction = maybeProposalsForMemberPlugin.find(p => p.type === 'ADD_MEMBER');

        if (!proposalIdForAction) {
          slog({
            level: 'error',
            message: `Matching proposal not found for onchain proposal id ${vote.onchainProposalId} in space ${maybeSpaceIdForMemberPlugin}`,
            requestId: block.requestId,
          });

          continue;
        }

        schemaVotes.push({
          vote: voteType,
          space_id: maybeSpaceIdForMemberPlugin,
          proposal_id: proposalIdForAction.id,
          onchain_proposal_id: vote.onchainProposalId,
          account_id: getChecksumAddress(vote.voter),
          created_at: block.timestamp,
          created_at_block: block.blockNumber,
        });
      }
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
