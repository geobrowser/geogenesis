import { z } from 'zod';

export const ZodMemberRemoved = z.object({
  // We add the type to the changeType to ensure we can validate the data
  // independently of a member added event. Otherwise we might parse both
  // events as if they are the same.
  changeType: z.string().refine(data => data === 'removed'),
  memberAddress: z.string(),
  daoAddress: z.string(),
  pluginAddress: z.string(),
});

export type MemberRemoved = z.infer<typeof ZodMemberRemoved>;

export const ZodMemberRemovedStreamResponse = z.object({
  membersRemoved: z.array(ZodMemberRemoved).min(1),
});
