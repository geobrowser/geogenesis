import { z } from 'zod';

export const ZodEditorRemoved = z.object({
  // We add the type to the changeType to ensure we can validate the data
  // independently of a member added event. Otherwise we might parse both
  // events as if they are the same.
  changeType: z.string().refine(data => data === 'removed'),
  editorAddress: z.string(),
  daoAddress: z.string(),
  pluginAddress: z.string(),
});

export type EditorRemoved = z.infer<typeof ZodEditorRemoved>;

export const ZodEditorRemovedStreamResponse = z.object({
  editorsRemoved: z.array(ZodEditorRemoved).min(1),
});
