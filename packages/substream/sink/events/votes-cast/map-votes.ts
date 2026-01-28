import { getChecksumAddress } from '@geoprotocol/geo-sdk';
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
import { deriveProposalId } from '~/sink/utils/id';
import { pool } from '~/sink/utils/pool';

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
  return Effect.gen(function* (_) {
    yield* _(Effect.logDebug('[MAP VOTES] Mapping votes'));
    const schemaVotes: S.proposal_votes.Insertable[] = [];

    for (const vote of votes) {
      const voteType = getVoteTypeAsText(vote.voteOption);
      const proposalId = deriveProposalId({
        onchainProposalId: vote.onchainProposalId,
        pluginAddress: vote.pluginAddress,
      });

      if (!voteType) {
        yield* _(
          Effect.logError(
            `[MAP VOTES] Vote type is invalid ${vote.voteOption} for vote ${vote.onchainProposalId} in space ${vote.pluginAddress}, skipping indexing the vote.`
          )
        );

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
      const [maybeSpaceIdForVotingPlugin, maybeSpaceIdForMemberPlugin] = yield* _(
        Effect.all(
          [
            Effect.promise(() => Spaces.findForVotingPlugin(vote.pluginAddress)),
            Effect.promise(() => Spaces.findForMembershipPlugin(vote.pluginAddress)),
          ],
          { concurrency: 2 }
        )
      );

      if (!maybeSpaceIdForVotingPlugin && !maybeSpaceIdForMemberPlugin) {
        yield* _(
          Effect.logError(`[MAP VOTES] Matching space in Proposal not found for plugin address ${vote.pluginAddress}`)
        );

        continue;
      }

      if (maybeSpaceIdForVotingPlugin) {
        yield* _(
          Effect.logDebug(
            `[MAP VOTES] Verifying proposal id for voting plugin with address ${vote.pluginAddress}. id: ${proposalId} onchainProposalId: ${vote.onchainProposalId} pluginAddress: ${vote.pluginAddress}`
          )
        );

        // We can derive the id for all proposals at this point except for edit proposals. This is because
        // edit proposal ids are passed from the client instead of derived from onchain data. We need to
        // derive it because at edit publish time we don't know the onchain id of the proposal.
        const maybeProposalsForOnchainProposalId = yield* _(
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

        const maybeEditProposal = maybeProposalsForOnchainProposalId.find(p => p.type === 'ADD_EDIT');

        schemaVotes.push({
          vote: voteType,
          space_id: maybeSpaceIdForVotingPlugin,
          // We can derive the id for all proposals at this point except for edit proposals. This is because
          // edit proposal ids are passed from the client instead of derived from onchain data. We need to
          // derive it because at edit publish time we don't know the onchain id of the proposal.
          proposal_id: maybeEditProposal
            ? maybeEditProposal.id
            : deriveProposalId({ onchainProposalId: vote.onchainProposalId, pluginAddress: vote.pluginAddress }),
          onchain_proposal_id: vote.onchainProposalId,
          account_id: getChecksumAddress(vote.voter),
          created_at: block.timestamp,
          created_at_block: block.blockNumber,
        });

        continue;
      }

      if (maybeSpaceIdForMemberPlugin) {
        yield* _(
          Effect.logDebug(`[MAP VOTES] Verifying proposal id for membership plugin with address ${vote.pluginAddress}`)
        );

        schemaVotes.push({
          vote: voteType,
          space_id: maybeSpaceIdForMemberPlugin,
          proposal_id: deriveProposalId({
            onchainProposalId: vote.onchainProposalId,
            pluginAddress: vote.pluginAddress,
          }),
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
