import { z } from 'zod';

export const ZodEditPublished = z.object({
  contentUri: z.string(),
  pluginAddress: z.string(),
  daoAddress: z.string(),
});

export const ZodEditPublishedStreamResponse = z.object({
  editsPublished: z.array(ZodEditPublished).min(1),
});

export type ChainEditPublished = z.infer<typeof ZodEditPublished>;
