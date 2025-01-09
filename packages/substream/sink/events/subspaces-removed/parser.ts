import { z } from 'zod';

export const ZodSubspaceRemoved = z.object({
  subspace: z.string(),
  pluginAddress: z.string(),
  daoAddress: z.string(),

  // We add the type to the changeType to ensure we can validate the data
  // independently of a subspace removal. Otherwise we'll parse both
  // events as if they are the same.
  changeType: z.string().refine(data => data === 'removed'),
});

export type SubspaceRemoved = z.infer<typeof ZodSubspaceRemoved>;

export const ZodSubspacesRemovedStreamResponse = z.object({
  subspacesRemoved: z.array(ZodSubspaceRemoved).min(1),
});
