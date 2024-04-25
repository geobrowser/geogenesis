import { z } from 'zod';

/**
 * Added or Removed Subspaces represent adding a space contracto to the hierarchy
 * of the DAO-based space. This is useful to "link" Spaces together in a
 * tree of spaces, allowing us to curate the graph of their knowledge and
 * permissions.
 */
export const ZodSubspaceAdded = z.object({
  subspace: z.string(),
  pluginAddress: z.string(),
  // We add the type to the changeType to ensure we can validate the data
  // independently of a subspace removal. Otherwise we'll parse both
  // events as if they are the same.
  changeType: z.string().refine(data => data === 'added'),
});

export type SubspaceAdded = z.infer<typeof ZodSubspaceAdded>;

export const ZodSubspacesAddedStreamResponse = z.object({
  subspacesAdded: z.array(ZodSubspaceAdded).min(1),
});
