import { Brand, Schema } from 'effect';

// Custom ID schema that accepts both UUID format (with hyphens) and hex format (without hyphens)
// The v2 API returns IDs without hyphens (32 hex chars)
const HexId = Schema.String.pipe(
  Schema.pattern(/^[0-9a-f]{32}$/i, {
    message: () => 'Expected 32-character hex string ID',
  })
);

export const DataType = Schema.Union(
  Schema.Literal('TEXT'),
  Schema.Literal('INTEGER'),
  Schema.Literal('FLOAT'),
  Schema.Literal('DECIMAL'),
  Schema.Literal('BOOLEAN'),
  Schema.Literal('DATE'),
  Schema.Literal('DATETIME'),
  Schema.Literal('POINT'),
  Schema.Literal('RELATION'),
  Schema.Literal('BYTES'),
  Schema.Literal('SCHEDULE'),
  Schema.Literal('EMBEDDING')
);

export type DataType = Schema.Schema.Type<typeof DataType>;

export const Property = Schema.Struct({
  id: HexId,
  name: Schema.NullOr(Schema.String),
  dataTypeId: Schema.NullOr(Schema.String),
  dataTypeName: Schema.NullOr(Schema.String),
  renderableTypeId: Schema.NullOr(Schema.String),
  renderableTypeName: Schema.NullOr(Schema.String),
  format: Schema.NullOr(Schema.String),
  isType: Schema.NullOr(Schema.Boolean),
});

export type RemoteProperty = Schema.Schema.Type<typeof Property>;

export const Type = Schema.Struct({
  id: HexId,
  name: Schema.NullOr(Schema.String),
  properties: Schema.Array(Property),
});

export const Value = Schema.Struct({
  spaceId: HexId,
  property: Property,
  text: Schema.NullOr(Schema.String),
  integer: Schema.NullOr(Schema.String),
  float: Schema.NullOr(Schema.Number),
  boolean: Schema.NullOr(Schema.Boolean),
  point: Schema.NullOr(Schema.String),
  time: Schema.NullOr(Schema.String),
  language: Schema.NullOr(Schema.String),
  unit: Schema.NullOr(Schema.String),
  datetime: Schema.NullOr(Schema.String),
  date: Schema.NullOr(Schema.String),
  decimal: Schema.NullOr(Schema.String),
  bytes: Schema.NullOr(Schema.String),
  schedule: Schema.NullOr(Schema.Unknown),
  embedding: Schema.NullOr(Schema.Unknown),
});

export type RemoteValue = Schema.Schema.Type<typeof Value>;

export const EntityType = Schema.Struct({
  id: HexId,
  name: Schema.NullOr(Schema.String),
});

export type RemoteEntityType = Schema.Schema.Type<typeof EntityType>;

export const Relation = Schema.Struct({
  id: HexId,
  spaceId: HexId,
  position: Schema.NullOr(Schema.String),
  verified: Schema.NullOr(Schema.Boolean),
  fromEntity: Schema.Struct({
    id: HexId,
    name: Schema.NullOr(Schema.String),
  }),
  toEntity: Schema.Struct({
    id: HexId,
    name: Schema.NullOr(Schema.String),
    types: Schema.Array(EntityType),
    valuesList: Schema.Array(
      Schema.Struct({
        propertyId: HexId,
        text: Schema.NullOr(Schema.String),
      })
    ),
  }),
  toSpaceId: Schema.NullOr(Schema.String),
  type: Schema.Struct({
    id: HexId,
    name: Schema.NullOr(Schema.String),
  }),
  entityId: HexId,
});

export type RemoteRelation = Schema.Schema.Type<typeof Relation>;

export const Entity = Schema.Struct({
  id: HexId,
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

const SpaceGovernanceType = Schema.Union(Schema.Literal('DAO'), Schema.Literal('PERSONAL'));
type SpaceGovernanceType = Schema.Schema.Type<typeof SpaceGovernanceType>;

export const Space = Schema.Struct({
  id: HexId,
  type: SpaceGovernanceType,
  address: AddressWithValidation,

  membersList: Schema.Array(
    Schema.Struct({
      memberSpaceId: HexId,
    })
  ),
  editorsList: Schema.Array(
    Schema.Struct({
      memberSpaceId: HexId,
    })
  ),

  page: Schema.NullOr(Entity),
});

export type RemoteSpace = Schema.Schema.Type<typeof Space>;

export const SearchResult = Schema.Struct({
  id: HexId,
  name: Schema.NullOr(Schema.String),
  description: Schema.NullOr(Schema.String),
  spaceIds: Schema.Array(HexId),
  types: Schema.Array(EntityType),
});

export type RemoteSearchResult = Schema.Schema.Type<typeof SearchResult>;
