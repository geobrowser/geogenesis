import { z } from 'zod';

export const ZodMemberAdded = z.object({
  memberAddress: z.string(),
  mainVotingPluginAddress: z.string(),
});

export type MemberAdded = z.infer<typeof ZodMemberAdded>;

export const ZodMemberAddedStreamResponse = z.object({
  membersAdded: z.array(ZodMemberAdded).min(1),
});
