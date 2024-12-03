import { z } from 'zod';

export const ZodMemberAdded = z.object({
  // We add the type to the changeType to ensure we can validate the data
  // independently of a subspace removal. Otherwise we'll parse both
  // events as if they are the same.
  changeType: z.string().refine(data => data === 'added'),
  memberAddress: z.string(),
  mainVotingPluginAddress: z.string(),
  daoAddress: z.string(),
});

export type MemberAdded = z.infer<typeof ZodMemberAdded>;

export const ZodMemberAddedStreamResponse = z.object({
  membersAdded: z.array(ZodMemberAdded).min(1),
});
