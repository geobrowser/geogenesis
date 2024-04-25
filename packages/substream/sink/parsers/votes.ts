import { z } from 'zod';

/**
 * Votes represent a vote on a proposal in a DAO-based space.
 *
 * Currently we use a simple majority voting model, where a proposal requires 51% of the
 * available votes in order to pass. Only editors are allowed to vote on proposals, but editors
 * _and_ members can create them.
 */
export const ZodVote = z.object({
  onchainProposalId: z.string(),
  voter: z.string(),
  voteOption: z.string(), // corresponds to VoteOption enum
  pluginAddress: z.string(),
});

export type Vote = z.infer<typeof ZodVote>;

export const ZodVotesCastStreamResponse = z.object({
  votesCast: z.array(ZodVote).min(1),
});
