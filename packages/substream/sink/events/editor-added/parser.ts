import { z } from 'zod';

export const ZodEditorAdded = z.object({
  editorAddress: z.string(),
  mainVotingPluginAddress: z.string(),
});

export type EditorAdded = z.infer<typeof ZodEditorAdded>;

export const ZodEditorAddedStreamResponse = z.object({
  editorsAdded: z.array(ZodEditorAdded).min(1),
});
