import { Brand, Schema } from 'effect';

export const DataType = Schema.Union(
  Schema.Literal('STRING'),
  Schema.Literal('NUMBER'),
  Schema.Literal('BOOLEAN'),
  Schema.Literal('TIME'),
  Schema.Literal('POINT'),
  Schema.Literal('RELATION')
);

export type DataType = Schema.Schema.Type<typeof DataType>;

export const Property = Schema.Struct({
  id: Schema.UUID,
  name: Schema.NullOr(Schema.String),
  dataType: DataType,
  renderableType: Schema.NullOr(Schema.UUID),
  format: Schema.NullOr(Schema.String),
  unit: Schema.NullOr(Schema.UUID),
  relationValueTypes: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      name: Schema.NullOr(Schema.String),
    })
  ),
});

export type RemoteProperty = Schema.Schema.Type<typeof Property>;

export const Type = Schema.Struct({
  id: Schema.UUID,
  name: Schema.NullOr(Schema.String),
  properties: Schema.Array(Property),
});

export const Value = Schema.Struct({
  spaceId: Schema.UUID,
  property: Property,
  string: Schema.NullOr(Schema.String),
  number: Schema.NullOr(Schema.String),
  boolean: Schema.NullOr(Schema.Boolean),
  point: Schema.NullOr(Schema.String),
  time: Schema.NullOr(Schema.String),
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
  fromEntity: Schema.Struct({
    id: Schema.UUID,
    name: Schema.NullOr(Schema.String),
  }),
  toEntity: Schema.Struct({
    id: Schema.UUID,
    name: Schema.NullOr(Schema.String),
    types: Schema.Array(EntityType),
    valuesList: Schema.Array(
      Schema.Struct({
        propertyId: Schema.UUID,
        string: Schema.NullOr(Schema.String),
      })
    ),
  }),
  toSpaceId: Schema.NullOr(Schema.String),
  type: Schema.Struct({
    id: Schema.UUID,
    name: Schema.NullOr(Schema.String),
    renderableType: Schema.NullOr(Schema.UUID),
  }),
  entityId: Schema.UUID,
});

export type RemoteRelation = Schema.Schema.Type<typeof Relation>;

export const Entity = Schema.Struct({
  id: Schema.UUID,
  name: Schema.NullOr(Schema.String),
  description: Schema.NullOr(Schema.String),
  types: Schema.Array(EntityType),
  spaceIds: Schema.Array(Schema.String),
  // cover
  // blocks: Schema.
  valuesList: Schema.Array(Value),
  relationsList: Schema.Array(Relation),
  // createdAt
  updatedAt: Schema.optional(Schema.String),
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

  membersList: Schema.Array(
    Schema.Struct({
      address: AddressWithValidation,
    })
  ),
  editorsList: Schema.Array(
    Schema.Struct({
      address: AddressWithValidation,
    })
  ),

  page: Schema.NullOr(Entity),
});

export type RemoteSpace = Schema.Schema.Type<typeof Space>;

export const SearchResult = Schema.Struct({
  id: Schema.UUID,
  name: Schema.NullOr(Schema.String),
  description: Schema.NullOr(Schema.String),
  spaceIds: Schema.Array(Schema.UUID),
  types: Schema.Array(EntityType),
});

export type RemoteSearchResult = Schema.Schema.Type<typeof SearchResult>;
