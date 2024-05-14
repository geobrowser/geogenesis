/**
 * message Edit {
  string name = 1;
  string version = 2;
  repeated Op ops = 3;
  repeated bytes authors = 4;
}
 */
import { z } from 'zod';

const ZodEditValueType = z.union([
  z.literal('TEXT'),
  z.literal('NUMBER'),
  z.literal('ENTITY'),
  z.literal('COLLECTION'),
  z.literal('CHECKBOX'),
  z.literal('URL'),
  z.literal('TIME'),
  z.literal('GEO_LOCATION'),
]);

const ZodEditValue = z.object({
  type: ZodEditValueType,
  value: z.string(),
});

const ZodEditPayload = z.object({
  entityId: z.string(),
  attributeId: z.string(),
  value: z.union([ZodEditValue, z.object({})]),
});

export const ZodEdit = z.object({
  name: z.string(),
  version: z.string(),
  ops: z.array(
    z.object({
      // upsert, delete. 0 is UNKNOWN and shouldn't be parsed
      opType: z.union([z.literal('SET_TRIPLE'), z.literal('DELETE_TRIPLE')]),
      payload: ZodEditPayload,
    })
  ),
  authors: z.array(z.string()),
});
