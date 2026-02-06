import { Schema } from 'effect';

import { ApiEntityDiffSchema } from './diff-shared';

export const ApiProposalDiffResponseSchema = Schema.Struct({
  proposalId: Schema.String,
  spaceId: Schema.String,
  proposalStatus: Schema.String,
  entities: Schema.Array(ApiEntityDiffSchema),
  pagination: Schema.Struct({
    cursor: Schema.NullOr(Schema.String),
    hasMore: Schema.Boolean,
    totalEntities: Schema.Number,
  }),
});

export type ApiProposalDiffResponse = Schema.Schema.Type<typeof ApiProposalDiffResponseSchema>;
export type ApiEntityDiff = Schema.Schema.Type<typeof ApiEntityDiffSchema>;
