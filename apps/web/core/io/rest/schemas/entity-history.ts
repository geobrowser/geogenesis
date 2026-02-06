import { Schema } from 'effect';

import { ApiEntityDiffSchema } from './diff-shared';

const ApiEntityVersionSchema = Schema.Struct({
  editId: Schema.String,
  blockNumber: Schema.String,
  createdAt: Schema.String,
});

export const ApiEntityVersionsResponseSchema = Schema.Struct({
  versions: Schema.Array(ApiEntityVersionSchema),
});

export type ApiEntityVersionsResponse = Schema.Schema.Type<typeof ApiEntityVersionsResponseSchema>;
export type ApiEntityVersion = Schema.Schema.Type<typeof ApiEntityVersionSchema>;

export const ApiEntityDiffResponseSchema = ApiEntityDiffSchema;

export type ApiEntityDiffResponse = Schema.Schema.Type<typeof ApiEntityDiffResponseSchema>;
