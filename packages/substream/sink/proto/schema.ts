import { z } from 'zod';

export const ZodIpfsMetadata = z.object({
  version: z.string().superRefine(v => v === '1.0.0'),
  type: z.union([z.literal('ADD_EDIT'), z.literal('IMPORT_SPACE')]),
});

const ZodEditSetTriplePayload = z.object({
  entity: z.string(),
  attribute: z.string(),
  // zod has issues with discriminated unions. We set the value
  // to any here and trust that it is constructed into the correct
  // format once it's decoded.
  value: z.object({
    value: z.string(),
    options: z
      .object({
        format: z.string().optional(),
        language: z.string().optional(),
        unit: z.string().optional(),
      })
      .optional(),
    type: z.number().transform(t => {
      switch (t) {
        case 1:
          return 'TEXT';
        case 2:
          return 'NUMBER';
        case 3:
          return 'CHECKBOX';
        case 4:
          return 'URL';
        case 5:
          return 'TIME';
        case 6:
          return 'POINT';
        default:
          return 'TEXT';
      }
    }),
  }),
});

const ZodEditDeleteTriplePayload = z.object({
  entity: z.string(),
  attribute: z.string(),
});

const ZodEditSetTripleOp = z.object({
  type: z
    .literal(1)
    .transform(() => 'SET_TRIPLE')
    .superRefine(arg => arg === 'SET_TRIPLE'),
  triple: ZodEditSetTriplePayload,
});

const ZodEditDeleteTripleOp = z.object({
  type: z
    .literal(2)
    .transform(() => 'DELETE_TRIPLE')
    .superRefine(arg => arg === 'DELETE_TRIPLE'),
  triple: ZodEditDeleteTriplePayload,
});

const ZodCreateRelationOp = z.object({
  type: z
    .literal(5)
    .transform(() => 'CREATE_RELATION')
    .superRefine(arg => arg === 'CREATE_RELATION'),
  relation: z.object({
    id: z.string(),
    index: z.string(),
    fromEntity: z.string(),
    toEntity: z.string(),
    type: z.string(),
  }),
});

const ZodDeleteRelationOp = z.object({
  type: z
    .literal(6)
    .transform(() => 'DELETE_RELATION')
    .superRefine(arg => arg === 'DELETE_RELATION'),
  relation: z.object({
    id: z.string(),
  }),
});

export const ZodOp = z.union([ZodEditSetTripleOp, ZodEditDeleteTripleOp, ZodCreateRelationOp, ZodDeleteRelationOp]);

export const ZodEdit = z.object({
  version: z.string(),
  type: z
    .literal(1)
    .transform(() => 'ADD_EDIT')
    .superRefine(arg => arg === 'ADD_EDIT'),
  id: z.string(),
  name: z.string(),
  ops: z.array(ZodOp),
  authors: z.array(z.string()),
});

export type DecodedEdit = z.infer<typeof ZodEdit>;

export const ZodImportEdit = ZodEdit.extend({
  createdBy: z.string(),
  createdAt: z.string(),
});

export type DecodedImportEdit = z.infer<typeof ZodImportEdit>;
