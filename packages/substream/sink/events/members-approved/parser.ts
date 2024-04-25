import { z } from 'zod';

export const ZodMembersApproved = z.object({
  onchainProposalId: z.string(),
  approver: z.string(),
  membershipPluginAddress: z.string(),
});

export type MembersApproved = z.infer<typeof ZodMembersApproved>;

export const ZodMembersApprovedStreamResponse = z.object({
  membersApproved: z.array(ZodMembersApproved).min(1),
});
