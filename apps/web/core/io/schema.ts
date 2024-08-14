import { Schema } from '@effect/schema';
import { Brand } from 'effect';

/*******************************************************************************
 * Nominal/branded types for the various ids in the data model
 ******************************************************************************/
export type TypeId = string & Brand.Brand<'TypeId'>;
export const TypeId = Brand.nominal<TypeId>();

const SubstreamType = Schema.Struct({
  id: Schema.String.pipe(Schema.fromBrand(TypeId)),
  name: Schema.NullOr(Schema.String),
});

export type SubstreamType = Schema.Schema.Type<typeof SubstreamType>;

export type EntityId = string & Brand.Brand<'EntityId'>;
export const EntityId = Brand.nominal<EntityId>();

const Nameable = Schema.Struct({
  name: Schema.NullOr(Schema.String),
});
type Nameable = Schema.Schema.Type<typeof Nameable>;

const Identifiable = Schema.Struct({
  id: Schema.String.pipe(Schema.fromBrand(EntityId)),
});

type Identifiable = Schema.Schema.Type<typeof Identifiable>;

export type SpaceId = string & Brand.Brand<'SpaceId'>;
export const SpaceId = Brand.nominal<SpaceId>();

// export const Address = Schema.String.pipe(Schema.length(42), Schema.startsWith('0x'));
export type Address = string & Brand.Brand<'Address'>;
export const Address = Brand.nominal<Address>();
export const AddressWithValidation = Schema.String.pipe(
  Schema.length(42),
  Schema.startsWith('0x'),
  Schema.fromBrand(Address)
);

/**
 * Entity types
 *
 * Entity types are a field that exist on any entity query. These define the types
 * for that entity. e.g., Person, Space, Nonprofit, etc.
 */
export const SubstreamEntityTypes = Schema.Struct({
  nodes: Schema.Array(
    Schema.Struct({
      type: SubstreamType,
    })
  ),
});

export type SubstreamEntityTypes = Schema.Schema.Type<typeof SubstreamEntityTypes>;

/*******************************************************************************
 * Triples
 ******************************************************************************/
/**
 * Text value
 */
const SubstreamTextValue = Schema.Struct({
  valueType: Schema.Literal('TEXT'),
  textValue: Schema.String,
});

type SubstreamTextValue = Schema.Schema.Type<typeof SubstreamTextValue>;

/**
 * Time value
 */
const SubstreamTimeValue = Schema.Struct({
  valueType: Schema.Literal('TIME'),
  // @TODO: Schema.Date refinement
  textValue: Schema.String,
});

type SubstreamTimeValue = Schema.Schema.Type<typeof SubstreamTimeValue>;

/**
 * Url value
 */
const SubstreamUriValue = Schema.Struct({
  valueType: Schema.Literal('URI'),
  textValue: Schema.String,
});

type SubstreamUriValue = Schema.Schema.Type<typeof SubstreamUriValue>;

/**
 * Entity value
 */
const SubstreamEntityValue = Schema.Struct({
  valueType: Schema.Literal('ENTITY'),
  textValue: Schema.Null,
  entityValue: Schema.Struct({
    id: Schema.String.pipe(Schema.fromBrand(EntityId), Schema.length(32)),
    name: Schema.NullOr(Schema.String),
    entityTypes: SubstreamEntityTypes,
  }),
});

type SubstreamEntityValue = Schema.Schema.Type<typeof SubstreamEntityValue>;

const SubstreamValue = Schema.Union(SubstreamTextValue, SubstreamEntityValue, SubstreamTimeValue, SubstreamUriValue);
type SubstreamValue = Schema.Schema.Type<typeof SubstreamValue>;

const SpaceGovernanceType = Schema.Union(Schema.Literal('PUBLIC'), Schema.Literal('PERSONAL'));
type SpaceGovernanceType = Schema.Schema.Type<typeof SpaceGovernanceType>;

const Account = Schema.Struct({
  id: AddressWithValidation,
});

const SchemaMembers = Schema.Struct({
  nodes: Schema.Array(Schema.Struct({ accountId: AddressWithValidation })),
});
type SchemaMembers = Schema.Schema.Type<typeof SchemaMembers>;

const SubstreamSpaceWithoutMetadata = Schema.Struct({
  id: Schema.String.pipe(Schema.length(32), Schema.fromBrand(SpaceId)),
  type: SpaceGovernanceType,
  daoAddress: AddressWithValidation,
  spacePluginAddress: AddressWithValidation,
  mainVotingPluginAddress: Schema.NullOr(AddressWithValidation),
  memberAccessPluginAddress: Schema.NullOr(AddressWithValidation),
  personalSpaceAdminPluginAddress: Schema.NullOr(AddressWithValidation),
  spaceEditors: SchemaMembers,
  spaceMembers: SchemaMembers,
  // @TODO: Including the metadata makes the schema circular when defining triples
  // and entities which is not allowed atm. There is another schema entry called
  // `SubstreamSpace` which adds the metadata after triples and entities schemas
  // are defined to avoid the circular schema issue.
});

type SubstreamSpaceWithoutMetadata = Schema.Schema.Type<typeof SubstreamSpaceWithoutMetadata>;

export const SubstreamTriple = Schema.extend(
  SubstreamValue,
  Schema.Struct({
    entity: Schema.extend(Identifiable, Nameable),
    attribute: Schema.extend(Identifiable, Nameable),
    space: SubstreamSpaceWithoutMetadata.pick('id'),
  })
);

export type SubstreamTriple = Schema.Schema.Type<typeof SubstreamTriple>;

/**
 * Relations
 */
const SubstreamRelation = Schema.Struct({
  id: Schema.String.pipe(Schema.fromBrand(EntityId)),
  index: Schema.String,
  typeOf: Schema.Struct({
    id: Schema.String.pipe(Schema.fromBrand(EntityId)),
    name: Schema.NullOr(Schema.String),
  }),
  // @TODO: Picking from SubstreamEntity here creates a circular schema which is not
  // allowed atm. For now we hard-code which fields from SubstreamEntity we want to
  // use from the SubstreamRelation.
  fromEntity: Schema.Struct({
    id: Schema.String.pipe(Schema.fromBrand(EntityId)),
    name: Schema.NullOr(Schema.String),
  }),
  toEntity: Schema.Struct({
    id: Schema.String.pipe(Schema.fromBrand(EntityId)),
    name: Schema.NullOr(Schema.String),

    entityTypes: SubstreamEntityTypes,

    // Currently our relation query only returns triples where the value type is URI
    triples: Schema.Struct({
      nodes: Schema.Array(SubstreamTriple),
    }),
  }),
});

export type SubstreamRelation = Schema.Schema.Type<typeof SubstreamRelation>;

/**
 * Entities
 */
export const SubstreamEntity = Schema.Struct({
  id: Schema.String.pipe(Schema.fromBrand(EntityId)),
  name: Schema.NullOr(Schema.String),
  description: Schema.NullOr(Schema.String),
  entityTypes: SubstreamEntityTypes,
  relationsByFromEntityId: Schema.Struct({
    nodes: Schema.Array(SubstreamRelation),
  }),
  triples: Schema.Struct({
    nodes: Schema.Array(SubstreamTriple),
  }),
});

export type SubstreamEntity = Schema.Schema.Type<typeof SubstreamEntity>;

// @TODO: Including the metadata makes the schema circular when defining triples
// and entities which is not allowed atm.For now we make a separate schema entry
// to not include the metadata the nextend it here to include the metadata.
//
// If you want metadata with the space then SubstreamSpace should be the schema
// used throughout the app.
export const SubstreamSpace = Schema.extend(
  SubstreamSpaceWithoutMetadata,
  Schema.Struct({
    // There might be more than one instance of an entity with type: Space in a space
    // at a given time. Once we add cardinality as part of schemas we can make some
    // safer assumptions about how many entities of a given type exist.
    spacesMetadata: Schema.Struct({
      nodes: Schema.Array(Schema.Struct({ entity: SubstreamEntity })),
    }),
  })
);

export type SubstreamSpace = Schema.Schema.Type<typeof SubstreamSpace>;

export const SubstreamSpaceEntityConfig = Schema.Struct({
  id: Schema.String.pipe(Schema.fromBrand(SpaceId)),
  spacesMetadata: Schema.Struct({
    nodes: Schema.Array(Schema.Struct({ entity: SubstreamEntity })),
  }),
});

export type SubstreamSpaceConfigEntityConfig = Schema.Schema.Type<typeof SubstreamSpaceEntityConfig>;

// Subspaces are currently only used in the app as a subset of all the properties
// available on a space, which is why they are a special type.
//
// For some reason we can't pick from an extended schema which is why we can't just
// use SubstreamSpace here to pick from.
export const SubstreamSubspace = Schema.extend(
  SubstreamSpaceWithoutMetadata.pick('id', 'daoAddress'),
  Schema.Struct({
    spaceEditors: Schema.Struct({
      totalCount: Schema.Number,
    }),
    spaceMembers: Schema.Struct({
      totalCount: Schema.Number,
    }),
    spacesMetadata: Schema.Struct({
      nodes: Schema.Array(Schema.Struct({ entity: SubstreamEntity })),
    }),
  })
);

export type SubstreamSubspace = Schema.Schema.Type<typeof SubstreamSubspace>;

/**
 * Search results are a subspace of entities which also include the spaces
 * that the entity belongs to.
 *
 * An entity belongs to a space when it has at least one triple in that space.
 */
export const SubstreamSearchResult = Schema.extend(
  SubstreamEntity.pick('id', 'name', 'entityTypes', 'description'),
  Schema.Struct({
    entitySpaces: Schema.Struct({
      nodes: Schema.Array(Schema.Struct({ space: SubstreamSpace })),
    }),
  })
);

export type SubstreamSearchResult = Schema.Schema.Type<typeof SubstreamSearchResult>;

// @TODO: Ops
// export type SubstreamOp = OmitStrict<SubstreamTriple, 'space'> &
//   SubstreamValue & {
//     id: string;
//     type: 'SET_TRIPLE' | 'DELETE_TRIPLE';
//     entityValue: string | null;
//   };

/**
 * Proposals
 */
export const ProposalStatus = Schema.Union(
  Schema.Literal('PROPOSED'),
  Schema.Literal('ACCEPTED'),
  Schema.Literal('REJECTED'),
  Schema.Literal('CANCELED'),
  Schema.Literal('EXECUTED')
);
export type ProposalStatus = Schema.Schema.Type<typeof ProposalStatus>;

const VoteType = Schema.Union(Schema.Literal('ACCEPT'), Schema.Literal('REJECT'));
type VoteType = Schema.Schema.Type<typeof VoteType>;

export const SubstreamVote = Schema.Struct({
  vote: VoteType,
  account: Account,
});

export type SubstreamVote = Schema.Schema.Type<typeof SubstreamVote>;

export const SubstreamProposedVersion = Schema.Struct({
  id: Schema.String.pipe(Schema.fromBrand(EntityId)),
  name: Schema.NullOr(Schema.String),
  createdBy: Account,
  createdAt: Schema.Number,
  createdAtBlock: Schema.String,
  space: SubstreamSpace,
  entity: SubstreamEntity,
  // @TODO: Ops
});

export const ProposalType = Schema.Union(
  Schema.Literal('ADD_EDIT'),
  Schema.Literal('ADD_MEMBER'),
  Schema.Literal('REMOVE_MEMBER'),
  Schema.Literal('ADD_SUBSPACE'),
  Schema.Literal('REMOVE_SUBSPACE'),
  Schema.Literal('ADD_EDITOR'),
  Schema.Literal('REMOVE_EDITOR')
);

export type ProposalType = Schema.Schema.Type<typeof ProposalType>;

export const SubstreamProposal = Schema.Struct({
  id: Schema.String.pipe(Schema.fromBrand(EntityId)),
  name: Schema.NullOr(Schema.String),
  type: ProposalType,
  onchainProposalId: Schema.String,
  createdBy: Account,
  createdAt: Schema.Number,
  createdAtBlock: Schema.String,
  space: SubstreamSpace,
  startTime: Schema.Number,
  endTime: Schema.Number,
  status: ProposalStatus,
  proposalVotes: Schema.Struct({
    nodes: Schema.Array(SubstreamVote),
    totalCount: Schema.Number,
  }),
  proposedVersions: Schema.Struct({
    nodes: Schema.Array(SubstreamProposedVersion),
  }),
});

export type SubstreamProposal = Schema.Schema.Type<typeof SubstreamProposal>;
