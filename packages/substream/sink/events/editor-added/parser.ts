import { z } from 'zod';

export const ZodEditorAdded = z.object({
  // We add the type to the changeType to ensure we can validate the data
  // independently of a subspace removal. Otherwise we'll parse both
  // events as if they are the same.
  changeType: z.string().refine(data => data === 'added'),
  editorAddress: z.string(),
  mainVotingPluginAddress: z.string(),
  daoAddress: z.string(),
});

export type EditorAdded = z.infer<typeof ZodEditorAdded>;

export const ZodEditorAddedStreamResponse = z.object({
  editorsAdded: z.array(ZodEditorAdded).min(1),
});
