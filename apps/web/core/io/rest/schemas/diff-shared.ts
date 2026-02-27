import { Schema } from 'effect';

export const ApiDiffChunkSchema = Schema.Struct({
  value: Schema.String,
  added: Schema.optional(Schema.Boolean),
  removed: Schema.optional(Schema.Boolean),
});

export const ApiValueDiffSchema = Schema.Struct({
  propertyId: Schema.String,
  spaceId: Schema.String,
  // Use String (not a strict union) for forward-compatibility with new value types
  type: Schema.String,
  before: Schema.NullOr(Schema.String),
  after: Schema.NullOr(Schema.String),
  diff: Schema.optional(Schema.Array(ApiDiffChunkSchema)),
});

export const ApiRelationEndpointSchema = Schema.Struct({
  toEntityId: Schema.String,
  toSpaceId: Schema.NullOr(Schema.String),
  position: Schema.NullOr(Schema.String),
});

export const ApiRelationDiffSchema = Schema.Struct({
  relationId: Schema.String,
  typeId: Schema.String,
  spaceId: Schema.String,
  changeType: Schema.Union(Schema.Literal('ADD'), Schema.Literal('REMOVE'), Schema.Literal('UPDATE')),
  before: Schema.NullOr(ApiRelationEndpointSchema),
  after: Schema.NullOr(ApiRelationEndpointSchema),
});

export const ApiBlockDiffSchema = Schema.Struct({
  id: Schema.String,
  type: Schema.Union(
    Schema.Literal('textBlock'),
    Schema.Literal('imageBlock'),
    Schema.Literal('videoBlock'),
    Schema.Literal('dataBlock')
  ),
  before: Schema.NullOr(Schema.String),
  after: Schema.NullOr(Schema.String),
  diff: Schema.optional(Schema.Array(ApiDiffChunkSchema)),
});

export const ApiEntityDiffSchema = Schema.Struct({
  entityId: Schema.String,
  name: Schema.NullOr(Schema.String),
  values: Schema.Array(ApiValueDiffSchema),
  relations: Schema.Array(ApiRelationDiffSchema),
  blocks: Schema.Array(ApiBlockDiffSchema),
});

export type ApiEntityDiffShape = Schema.Schema.Type<typeof ApiEntityDiffSchema>;
