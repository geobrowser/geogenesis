import { z } from 'zod';

/**
 * Votes represent a vote on a proposal in a DAO-based space.
 *
 * Currently we use a simple majority voting model, where a proposal requires 51% of the
 * available votes in order to pass. Only editors are allowed to vote on proposals, but editors
 * _and_ members can create them.
 */
export const ZodVoteCast = z.object({
  onchainProposalId: z.string(),
  voter: z.string(),
  voteOption: z.string(), // corresponds to VoteOption enum
  pluginAddress: z.string(),
});

export type VoteCast = z.infer<typeof ZodVoteCast>;

export const ZodVotesCastStreamResponse = z.object({
  votesCast: z.array(ZodVoteCast).min(1),
});
