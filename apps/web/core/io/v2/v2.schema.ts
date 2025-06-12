// @TODO:
// Entity
// Value
// Relation
import { Brand, Schema } from 'effect';

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
  property: Property,
  value: Schema.String,
  language: Schema.NullOr(Schema.String),
  unit: Schema.NullOr(Schema.String),
});

export type RemoteValue = Schema.Schema.Type<typeof Value>;

export const EntityType = Schema.Struct({
  id: Schema.UUID,
  name: Schema.NullOr(Schema.String),
});

export type RemoteEntityType = Schema.Schema.Type<typeof EntityType>;

export const Relation = Schema.Struct({
  id: Schema.UUID,
  spaceId: Schema.UUID,
  position: Schema.NullOr(Schema.String),
  verified: Schema.NullOr(Schema.Boolean),
  to: Schema.Struct({
    id: Schema.UUID,
    name: Schema.NullOr(Schema.String),
    types: Schema.Array(EntityType),
    values: Schema.Array(
      Schema.Struct({
        propertyId: Schema.UUID,
        value: Schema.String,
      })
    ),
  }),
  toSpaceId: Schema.NullOr(Schema.String),
  type: Schema.Struct({
    id: Schema.UUID,
    entity: Schema.Struct({
      name: Schema.NullOr(Schema.String),
    }),
    renderableType: Schema.NullOr(Schema.Union(Schema.Literal('IMAGE'), Schema.Literal('URL'))),
  }),
  entityId: Schema.UUID,
});

export type RemoteRelation = Schema.Schema.Type<typeof Relation>;

export const Entity = Schema.Struct({
  id: Schema.UUID,
  name: Schema.NullOr(Schema.String),
  description: Schema.NullOr(Schema.String),
  types: Schema.Array(EntityType),
  // spaces
  // cover
  // blocks: Schema.
  values: Schema.Array(Value),
  relations: Schema.Array(Relation),
  // createdAt
  // updatedAt
});

export type RemoteEntity = Schema.Schema.Type<typeof Entity>;

export type Address = string & Brand.Brand<'Address'>;
export const Address = Brand.nominal<Address>();
export const AddressWithValidation = Schema.String.pipe(
  Schema.length(42),
  Schema.startsWith('0x'),
  Schema.fromBrand(Address)
);

const SpaceGovernanceType = Schema.Union(Schema.Literal('PUBLIC'), Schema.Literal('PERSONAL'));
type SpaceGovernanceType = Schema.Schema.Type<typeof SpaceGovernanceType>;

export const Space = Schema.Struct({
  id: Schema.UUID,
  type: SpaceGovernanceType,
  daoAddress: AddressWithValidation,
  spaceAddress: AddressWithValidation,
  mainVotingAddress: Schema.NullOr(AddressWithValidation),
  membershipAddress: Schema.NullOr(AddressWithValidation),
  personalAddress: Schema.NullOr(AddressWithValidation),
  entity: Schema.NullOr(Entity),
});

export type RemoteSpace = Schema.Schema.Type<typeof Space>;
