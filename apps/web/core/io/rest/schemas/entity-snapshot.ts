import { Schema } from 'effect';

import { ApiProfileSchema } from './profile';

const ApiVersionedValueSchema = Schema.Struct({
  propertyId: Schema.String,
  spaceId: Schema.String,
  boolean: Schema.optional(Schema.NullOr(Schema.Boolean)),
  integer: Schema.optional(Schema.NullOr(Schema.Number)),
  float: Schema.optional(Schema.NullOr(Schema.Number)),
  decimal: Schema.optional(Schema.NullOr(Schema.String)),
  text: Schema.optional(Schema.NullOr(Schema.String)),
  bytes: Schema.optional(Schema.NullOr(Schema.String)),
  date: Schema.optional(Schema.NullOr(Schema.String)),
  time: Schema.optional(Schema.NullOr(Schema.String)),
  datetime: Schema.optional(Schema.NullOr(Schema.String)),
  schedule: Schema.optional(Schema.NullOr(Schema.Unknown)),
  point: Schema.optional(Schema.NullOr(Schema.String)),
  rect: Schema.optional(Schema.NullOr(Schema.String)),
  embedding: Schema.optional(Schema.NullOr(Schema.Unknown)),
  language: Schema.optional(Schema.NullOr(Schema.String)),
  unit: Schema.optional(Schema.NullOr(Schema.String)),
  contextRootId: Schema.optional(Schema.NullOr(Schema.String)),
  contextEdgeTypeId: Schema.optional(Schema.NullOr(Schema.String)),
});

const ApiVersionedRelationSchema = Schema.Struct({
  relationId: Schema.String,
  typeId: Schema.String,
  fromEntityId: Schema.String,
  fromSpaceId: Schema.optional(Schema.NullOr(Schema.String)),
  toEntityId: Schema.String,
  toSpaceId: Schema.optional(Schema.NullOr(Schema.String)),
  position: Schema.optional(Schema.NullOr(Schema.String)),
  spaceId: Schema.String,
  verified: Schema.optional(Schema.NullOr(Schema.Boolean)),
  contextRootId: Schema.optional(Schema.NullOr(Schema.String)),
  contextEdgeTypeId: Schema.optional(Schema.NullOr(Schema.String)),
});

const ApiBlockSnapshotSchema = Schema.Struct({
  id: Schema.String,
  values: Schema.Array(ApiVersionedValueSchema),
  relations: Schema.Array(ApiVersionedRelationSchema),
});

/** Entity snapshot from GET /versioned/entities/:id?editId=...&spaceId=... */
export const ApiEntitySnapshotResponseSchema = Schema.Struct({
  id: Schema.String,
  values: Schema.Array(ApiVersionedValueSchema),
  relations: Schema.Array(ApiVersionedRelationSchema),
  blocks: Schema.Array(ApiBlockSnapshotSchema),
  editName: Schema.NullOr(Schema.String),
  createdById: Schema.NullOr(Schema.String),
  createdBy: Schema.NullOr(ApiProfileSchema),
});

export type ApiEntitySnapshotResponse = Schema.Schema.Type<typeof ApiEntitySnapshotResponseSchema>;
export type ApiVersionedValue = Schema.Schema.Type<typeof ApiVersionedValueSchema>;
export type ApiVersionedRelation = Schema.Schema.Type<typeof ApiVersionedRelationSchema>;
export type ApiBlockSnapshot = Schema.Schema.Type<typeof ApiBlockSnapshotSchema>;
