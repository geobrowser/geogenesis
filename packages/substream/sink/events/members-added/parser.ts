import { z } from 'zod';

export const ZodMembersAdded = z.object({
  memberAddress: z.string(),
  mainVotingPluginAddress: z.string(),
});

export type MembersAdded = z.infer<typeof ZodMembersAdded>;

export const ZodMembersAddedStreamResponse = z.object({
  membersAdded: z.array(ZodMembersAdded).min(1),
});
