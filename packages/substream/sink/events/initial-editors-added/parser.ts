import { z } from 'zod';

/**
 * Adding editors represents granting the editor permission to users in a DAO-based space.
 * Editors are also granted the Member role.
 *
 * An editor has editing and voting permissions in a DAO-based space. Editors join a space
 * one of two ways:
 * 1. They submit a request to join the space as an editor which goes to a vote. The editors
 *    in the space vote on whether to accept the new editor.
 * 2. They are added as a set of initial editors when first creating the space. This allows
 *    space deployers to bootstrap a set of editors on space creation.
 */
export const ZodInitialEditorsAdded = z.object({
  addresses: z.array(z.string()),
  pluginAddress: z.string(),
});

export type InitialEditorsAdded = z.infer<typeof ZodInitialEditorsAdded>;

export const ZodInitialEditorsAddedStreamResponse = z.object({
  initialEditorsAdded: z.array(ZodInitialEditorsAdded).min(1),
});
