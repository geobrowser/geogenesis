import { z } from 'zod';

/**
 * Adding editors represents granting the editor permission to users in a DAO-based space.
 *
 * The data model for DAO-based spaces works slightly differently than in legacy spaces.
 * This means there will be a period where we need to support both data models depending
 * on which space/contract we are working with. Eventually these data models will be merged
 * and usage of the legacy space contracts will be migrated to the DAO-based contracts, but
 * for now we are appending "V2" to permissions data models to denote it's used for the
 * DAO-based spaces.
 *
 * An editor has editing and voting permissions in a DAO-based space. Editors join a space
 * one of two ways:
 * 1. They submit a request to join the space as an editor which goes to a vote. The editors
 *    in the space vote on whether to accept the new editor.
 * 2. They are added as a set of initial editors when first creating the space. This allows
 *    space deployers to bootstrap a set of editors on space creation.
 */
export const ZodEditorsAdded = z.object({
  addresses: z.array(z.string()),
  pluginAddress: z.string(),
});

export type EditorsAdded = z.infer<typeof ZodEditorsAdded>;

export const ZodEditorsAddedStreamResponse = z.object({
  editorsAdded: z.array(ZodEditorsAdded).min(1),
});
