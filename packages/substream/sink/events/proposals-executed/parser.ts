import { z } from 'zod';

export const ZodProposalExecuted = z.object({
  proposalId: z.string(),
  pluginAddress: z.string(),
});

export type ProposalExecuted = z.infer<typeof ZodProposalExecuted>;

export const ZodProposalExecutedStreamResponse = z.object({
  executedProposals: z.array(ZodProposalExecuted).min(1),
});
