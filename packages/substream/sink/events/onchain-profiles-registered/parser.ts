import { z } from 'zod';

/** Onchain Profile registrations */
export const ZodOnchainProfileRegistered = z.object({
  requestor: z.string(),
  space: z.string(),
  id: z.string(),
});

export type OnchainProfileRegistered = z.infer<typeof ZodOnchainProfileRegistered>;

export const ZodOnchainProfilesRegisteredStreamResponse = z.object({
  profilesRegistered: z.array(ZodOnchainProfileRegistered).min(1),
});
