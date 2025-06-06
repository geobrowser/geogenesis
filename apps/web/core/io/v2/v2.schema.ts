// @TODO:
// Entity
// Value
// Relation
import { Schema } from '@effect/schema';

// Need a more ergonomic querying system besides the graphql and shitty
// variable mechanism we have now

export const DataType = Schema.Union(
  Schema.Literal('TEXT'),
  Schema.Literal('NUMBER'),
  Schema.Literal('CHECKBOX'),
  Schema.Literal('TIME'),
  Schema.Literal('POINT'),
  Schema.Literal('RELATION')
);

export const Property = Schema.Struct({
  id: Schema.UUID,
  entity: Schema.Struct({
    id: Schema.UUID,
    name: Schema.NullOr(Schema.String),
  }),
  dataType: DataType,
  relationValueTypes: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      name: Schema.NullOr(Schema.String),
    })
  ),
});

export const Type = Schema.Struct({
  id: Schema.UUID,
  name: Schema.NullOr(Schema.String),
  properties: Schema.Array(Property),
});

export const Value = Schema.Struct({
  spaceId: Schema.UUID,
  entityId: Schema.UUID,
  property: Property,
  value: Schema.String,
  language: Schema.NullOr(Schema.String),
  unit: Schema.NullOr(Schema.String),
});

export const Relation = Schema.Struct({
  id: Schema.UUID,
  spaceId: Schema.UUID,
  position: Schema.NullOr(Schema.String),
  to: Schema.Struct({
    id: Schema.UUID,
    name: Schema.NullOr(Schema.String),
  }),
  toSpaceId: Schema.NullOr(Schema.String),
  type: Schema.Struct({
    id: Schema.UUID,
    name: Schema.NullOr(Schema.String),
  }),
});

export const Entity = Schema.Struct({
  id: Schema.UUID,
  name: Schema.NullOr(Schema.String),
  description: Schema.NullOr(Schema.String),
  // spaces
  // cover
  // blocks: Schema.
  values: Schema.Array(Value),
  relations: Schema.Array(Relation),
  // createdAt
  // updatedAt
});
