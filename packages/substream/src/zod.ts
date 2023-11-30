import { z } from 'zod';

import type { OmitStrict } from './types';

export const ZodEntry = z.object({
  id: z.string(),
  index: z.string(),
  uri: z.string(),
  author: z.string(),
  space: z.string(),
});
export type Entry = z.infer<typeof ZodEntry>;

export const ZodAction = z.object({
  type: z.enum(['createTriple', 'deleteTriple']),
  entityId: z.string().refine(data => data !== '', {
    message: 'Entity id cannot be an empty string',
  }),
  attributeId: z.string().refine(data => data !== '', {
    message: 'Attribute id cannot be an empty string',
  }),
  entityName: z.string().nullish(),
  value: z
    .object({
      type: z.enum(['number', 'string', 'entity', 'image', 'date', 'url']),
      id: z.string(),
      value: z.string().nullish(),
    })
    .refine(data => data.id || data.value, {
      message: 'Either id or value must be provided',
    }),
  // @TODO: Validate value type union for each value type
});

export type Action = z.infer<typeof ZodAction>;

export const ZodUriData = z.object({
  name: z.string().optional(),
  type: z.string(),
  version: z.string(),
  // We filter valid actions later one-by-one. We avoid filtering all actions
  // here as it would invalidate the entire array of actions instead of granularly.
  // @TODO: Is there a way to validate the entire array and filter invalid actions?
  actions: z.array(z.any()),
});

export type UriData = z.infer<typeof ZodUriData>;

export const ZodFullEntry = ZodEntry.extend({
  uriData: ZodUriData,
});

export interface FullEntry extends z.infer<typeof ZodFullEntry> {
  // Set the real Action type. We only use z.any() in ZodUriData to avoid
  // rejecting the entire array of actions if one of them is invalid.
  uriData: OmitStrict<UriData, 'actions'> & { actions: Action[] };
}

export const ZodRoleChange = z.object({
  id: z.string(),
  role: z.enum(['ADMIN', 'MEMBER', 'MODERATOR']),
  account: z.string(),
  sender: z.string(),
  space: z.string(),
});

export type RoleChange = z.infer<typeof ZodRoleChange>;

export const ZodEntryStreamResponse = z.object({
  entries: z.array(ZodEntry).min(1),
});

export const ZodRoleChangeStreamResponse = z.object({
  roleChanges: z
    .array(
      z
        .object({
          granted: ZodRoleChange.optional(),
          revoked: ZodRoleChange.optional(),
        })
        .refine(data => (data.granted ? !data.revoked : data.revoked), {
          message: 'Only one of granted or revoked must be provided',
        })
    )
    .min(1),
});
