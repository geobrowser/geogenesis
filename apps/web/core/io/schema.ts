import { Schema } from '@effect/schema';
import { Brand } from 'effect';

/*******************************************************************************
 * Nominal/branded types for the various ids in the data model
 ******************************************************************************/
type TypeId = string & Brand.Brand<'TypeId'>;
const TypeId = Brand.nominal<TypeId>();

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

const Address = Schema.String.pipe(Schema.length(42), Schema.startsWith('0x'));
type Address = Schema.Schema.Type<typeof Address> & Brand.Brand<'Address'>;

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
 * ImageValueTriple is a special case of a substream triple where we only query
 * the image url value of an image entity.
 */
export const SubstreamImageValueTriple = Schema.Struct({
  valueType: Schema.Literal('URL'),
  attributeId: Schema.String.pipe(Schema.fromBrand(EntityId)),
  textValue: Schema.String,
});

export type SubstreamImageValueTriple = Schema.Schema.Type<typeof SubstreamImageValueTriple>;

/**
 * Entity value
 */
const SubstreamEntityValue = Schema.Struct({
  valueType: Schema.Literal('ENTITY'),
  entityValue: Schema.Struct({
    id: Schema.String.pipe(Schema.fromBrand(EntityId), Schema.length(32)),
    name: Schema.NullOr(Schema.String),
    types: Schema.Struct({
      nodes: Schema.Array(SubstreamType),
    }),

    // We might be fetching an entity that's meant to be used as an image.
    // If so we need to read from the triples on the entity to get the
    // image url for to render.
    triples: Schema.Struct({
      nodes: Schema.Array(SubstreamImageValueTriple),
    }),
  }),
});

type SubstreamEntityValue = Schema.Schema.Type<typeof SubstreamEntityValue>;

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
const SubstreamUrlValue = Schema.Struct({
  valueType: Schema.Literal('URL'),
  textValue: Schema.String,
});

type SubstreamUrlValue = Schema.Schema.Type<typeof SubstreamTimeValue>;

const SubstreamValue = Schema.Union(SubstreamTextValue, SubstreamEntityValue, SubstreamTimeValue, SubstreamUrlValue);
type SubstreamValue = Schema.Schema.Type<typeof SubstreamValue>;

const SpaceGovernanceType = Schema.Union(Schema.Literal('PUBLIC'), Schema.Literal('PERSONAL'));
type SpaceGovernanceType = Schema.Schema.Type<typeof SpaceGovernanceType>;

const Account = Schema.Struct({
  id: Address,
});

const SchemaMembers = Schema.Array(Schema.Struct({ nodes: Schema.Array(Account) }));
type SchemaMembers = Schema.Schema.Type<typeof SchemaMembers>;

const SubstreamSpaceWithoutMetadata = Schema.Struct({
  id: Schema.String.pipe(Schema.length(32), Schema.fromBrand(SpaceId)),
  type: SpaceGovernanceType,
  daoAddress: Address,
  spacePluginAddress: Address,
  mainVotingPluginAddress: Schema.NullOr(Address),
  memberAccessPluginAddress: Schema.NullOr(Address),
  personalSpaceAdminPluginAddress: Schema.NullOr(Address),
  spaceEditors: SchemaMembers,
  spaceMembers: SchemaMembers,
});

type SubstreamSpaceWithoutMetadata = Schema.Schema.Type<typeof SubstreamSpaceWithoutMetadata>;

const SubstreamTriple = Schema.extend(
  SubstreamValue,
  Schema.Struct({
    entity: Schema.extend(Identifiable, Nameable),
    attribute: Schema.extend(Identifiable, Nameable),
    // @TODO: Including the metadata makes the schema circular which is not allowed atm.
    // For now we make a separate schema entry to not include the metadata
    space: Schema.Struct({
      id: Schema.String.pipe(Schema.length(32), Schema.fromBrand(SpaceId)),
    }),
  })
);

export type SubstreamTriple = Schema.Schema.Type<typeof SubstreamTriple>;

/**
 * Relations
 */
const SubstreamRelation = Schema.Struct({
  index: Schema.String,
  typeOf: Schema.Struct({
    id: Schema.String.pipe(Schema.fromBrand(EntityId)),
    name: Schema.NullOr(Schema.String),
  }),
  fromEntity: Schema.Struct({
    id: Schema.String.pipe(Schema.fromBrand(EntityId)),
    name: Schema.NullOr(Schema.String),
  }),
  toEntity: Schema.Struct({
    id: Schema.String.pipe(Schema.fromBrand(EntityId)),
    name: Schema.NullOr(Schema.String),
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
  types: Schema.Struct({
    nodes: Schema.Array(SubstreamType),
  }),
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
export const SubstreamSpace = Schema.extend(
  SubstreamSpaceWithoutMetadata,
  Schema.Struct({
    spacesMetadata: Schema.Struct({
      nodes: Schema.Array(Schema.Struct({ entity: SubstreamEntity })),
    }),
  })
);

// export type SubstreamSpace = Schema.Schema.Type<typeof SubstreamSpace>;

/**
 * Search results
 *
 * Triples with space metadata are a special triple that's used by our search results
 * API to include the space metadata in the results of each triple. Each triple with
 * metadata is used to aggregate all of the spaces that a space belongs to. Ideally
 * this is derived by the database and query so we don't have to do this locally.
 *
 * These triples get aggregated into an entity result
 */
const SubstreamTripleSearchResult = Schema.extend(
  SubstreamValue,
  Schema.Struct({
    entity: Schema.extend(Identifiable, Nameable),
    attribute: Schema.extend(Identifiable, Nameable),
    // @TODO: Should be picked from SubstreamSpace, but SubstreamSpace.pick
    // is not working as of @effect/schema@0.70.0
    space: Schema.Struct({
      id: Schema.String.pipe(Schema.length(32), Schema.fromBrand(SpaceId)),
      spacesMetadata: Schema.Struct({
        nodes: Schema.Array(Schema.Struct({ entity: SubstreamEntity })),
      }),
    }),
  })
);

type SubstreamTripleSearchResult = Schema.Schema.Type<typeof SubstreamTripleSearchResult>;

export const SubstreamSearchResult = Schema.Struct({
  // @TODO: These properties should be picked from SubstreamEntity, but SubstreamEntity.pick
  // is not working as of @effect/schema@0.70.0
  id: Schema.String.pipe(Schema.fromBrand(EntityId)),
  name: Schema.NullOr(Schema.String),

  // Triples and types are unique to the search result struct and not picked from SubstreamEntity
  triples: Schema.Struct({
    nodes: Schema.Array(SubstreamTripleSearchResult),
  }),
  types: Schema.Struct({
    nodes: Schema.Array(SubstreamType),
  }),
});

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
