import { z } from 'zod';

/** Creating a space plugin on a DAO */
export const ZodSpacePluginCreated = z.object({
  daoAddress: z.string(),
  spaceAddress: z.string(),
});

export type SpacePluginCreated = z.infer<typeof ZodSpacePluginCreated>;

export const ZodSpacePluginCreatedStreamResponse = z.object({
  spacesCreated: z.array(ZodSpacePluginCreated).min(1),
});

/** Creating governance plugins on a DAO */
export const ZodGovernancePluginsCreated = z.object({
  daoAddress: z.string(),
  mainVotingAddress: z.string(),
  memberAccessAddress: z.string(),
});

export type GovernancePluginsCreated = z.infer<typeof ZodGovernancePluginsCreated>;

export const ZodGovernancePluginsCreatedStreamResponse = z.object({
  governancePluginsCreated: z.array(ZodGovernancePluginsCreated).min(1),
});
