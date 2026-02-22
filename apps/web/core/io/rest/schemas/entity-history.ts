import { Schema } from 'effect';

import { ApiEntityDiffSchema } from './diff-shared';
import { ApiProfileSchema } from './profile';

const ApiEntityVersionSchema = Schema.Struct({
  editId: Schema.String,
  name: Schema.NullOr(Schema.String),
  createdById: Schema.NullOr(Schema.String),
  createdBy: Schema.NullOr(ApiProfileSchema),
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
