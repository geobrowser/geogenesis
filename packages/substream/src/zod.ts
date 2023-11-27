import { z } from "zod";

export const ZodEntry = z.object({
  id: z.string(),
  index: z.string(),
  uri: z.string(),
  author: z.string(),
  space: z.string(),
});
export type Entry = z.infer<typeof ZodEntry>;

export const ZodAction = z.object({
  type: z.enum(["createTriple", "deleteTriple"]),
  entityId: z.string(),
  attributeId: z.string(),
  entityName: z.string().nullish(),
  value: z
    .object({
      type: z.enum(["number", "string", "entity", "image", "date", "url"]),
      id: z.string(),
      value: z.string().nullish(),
    })
    .refine((data) => data.id || data.value, {
      message: "Either id or value must be provided",
    }),
});

export type Action = z.infer<typeof ZodAction>;

export const ZodUriData = z.object({
  name: z.string().optional(),
  type: z.string(),
  version: z.string(),
  actions: z.array(z.any()), // Parsing immediately after receiving data
});
export type UriData = z.infer<typeof ZodUriData>;

export const ZodFullEntry = ZodEntry.extend({
  uriData: ZodUriData,
});
export type FullEntry = z.infer<typeof ZodFullEntry>;

export const ZodRoleChange = z.object({
  id: z.string(),
  role: z.enum(["ADMIN", "MEMBER", "MODERATOR"]),
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
        .refine((data) => (data.granted ? !data.revoked : data.revoked), {
          message: "Only one of granted or revoked must be provided",
        })
    )
    .min(1),
});
