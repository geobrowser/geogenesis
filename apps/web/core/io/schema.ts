import { Schema } from '@effect/schema';
import { Brand } from 'effect';

/*******************************************************************************
 * Nominal/branded types for the various ids in the data model
 ******************************************************************************/
export type TypeId = string & Brand.Brand<'TypeId'>;
export const TypeId = Brand.nominal<TypeId>();

export type EntityId = string & Brand.Brand<'EntityId'>;
export const EntityId = Brand.nominal<EntityId>();

const SubstreamType = Schema.Struct({
  id: Schema.String.pipe(Schema.fromBrand(TypeId)),
  entityId: Schema.String.pipe(Schema.fromBrand(EntityId)),
  name: Schema.NullOr(Schema.String),
});

export type SubstreamType = Schema.Schema.Type<typeof SubstreamType>;

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
export const SubstreamVersionTypes = Schema.Struct({
  nodes: Schema.Array(
    Schema.Struct({
      type: SubstreamType,
    })
  ),
});

export type SubstreamEntityTypes = Schema.Schema.Type<typeof SubstreamVersionTypes>;

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
  formatOption: Schema.NullOr(Schema.String),
  languageOption: Schema.NullOr(Schema.String),
  unitOption: Schema.NullOr(Schema.String),
});

type SubstreamTimeValue = Schema.Schema.Type<typeof SubstreamTimeValue>;

/**
 * Url value
 */
const SubstreamUrlValue = Schema.Struct({
  valueType: Schema.Literal('URL'),
  textValue: Schema.String,
});

type SubstreamUrlValue = Schema.Schema.Type<typeof SubstreamUrlValue>;
const SubstreamNumberValue = Schema.Struct({
  valueType: Schema.Literal('NUMBER'),
  textValue: Schema.String,
});

type SubstreamNumberValue = Schema.Schema.Type<typeof SubstreamNumberValue>;

const SubstreamCheckboxValue = Schema.Struct({
  valueType: Schema.Literal('CHECKBOX'),
  booleanValue: Schema.Boolean,
});

type SubstreamCheckboxValue = Schema.Schema.Type<typeof SubstreamCheckboxValue>;

const SubstreamValue = Schema.Union(
  SubstreamTextValue,
  SubstreamTimeValue,
  SubstreamUrlValue,
  SubstreamCheckboxValue,
  SubstreamNumberValue
);

type SubstreamValue = Schema.Schema.Type<typeof SubstreamValue>;

const SpaceGovernanceType = Schema.Union(Schema.Literal('PUBLIC'), Schema.Literal('PERSONAL'));
type SpaceGovernanceType = Schema.Schema.Type<typeof SpaceGovernanceType>;

const Account = AddressWithValidation;

const SchemaMembers = Schema.Struct({
  nodes: Schema.Array(Schema.Struct({ accountId: AddressWithValidation })),
});
type SchemaMembers = Schema.Schema.Type<typeof SchemaMembers>;

const SubstreamSpaceWithoutMetadata = Schema.Struct({
  id: Schema.String.pipe(Schema.fromBrand(SpaceId)),
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
    version: Schema.Struct({
      entityId: Schema.String.pipe(Schema.fromBrand(EntityId)),
      name: Schema.NullOr(Schema.String),
    }),
    attributeVersion: Schema.Struct({
      entityId: Schema.String.pipe(Schema.fromBrand(EntityId)),
      name: Schema.NullOr(Schema.String),
    }),
    spaceId: Schema.String.pipe(Schema.fromBrand(EntityId)),
  })
);

export type SubstreamTriple = Schema.Schema.Type<typeof SubstreamTriple>;

/**
 * Relations can point to both the set of entities in type/from/to but also
 * a specific version of type/from/to at the time the relation was created.
 *
 * SubstreamRelationHistorical points to a specific version of type/from/to
 * which is set at the time the relation was created.
 */
const SubstreamRelationHistorical = Schema.Struct({
  id: Schema.String.pipe(Schema.fromBrand(EntityId)),
  spaceId: Schema.String,
  entityId: Schema.String.pipe(Schema.fromBrand(EntityId)),
  index: Schema.String,
  typeOfVersion: Schema.Struct({
    id: Schema.String.pipe(Schema.fromBrand(EntityId)),
    entityId: Schema.String.pipe(Schema.fromBrand(EntityId)),
    name: Schema.NullOr(Schema.String),
  }),
  // @TODO: Picking from SubstreamEntity here creates a circular schema which is not
  // allowed atm. For now we hard-code which fields from SubstreamEntity we want to
  // use from the SubstreamRelation.
  fromVersion: Schema.Struct({
    id: Schema.String.pipe(Schema.fromBrand(EntityId)),
    entityId: Schema.String.pipe(Schema.fromBrand(EntityId)),
    name: Schema.NullOr(Schema.String),
  }),
  toVersion: Schema.Struct({
    id: Schema.String.pipe(Schema.fromBrand(EntityId)),
    entityId: Schema.String.pipe(Schema.fromBrand(EntityId)),
    name: Schema.NullOr(Schema.String),
    versionTypes: SubstreamVersionTypes,

    // Currently our relation query only returns triples where the value type is URL
    triples: Schema.Struct({
      nodes: Schema.Array(SubstreamTriple),
    }),
  }),
});

export type SubstreamRelationHistorical = Schema.Schema.Type<typeof SubstreamRelationHistorical>;

/**
 * Relations can point to both the set of entities in type/from/to but also
 * a specific version of type/from/to at the time the relation was created.
 *
 * SubstreamRelationLive points to the set of entities in type/from/to and
 * not a specific version for each.
 */
const SubstreamRelationLive = Schema.Struct({
  id: Schema.String.pipe(Schema.fromBrand(EntityId)),
  spaceId: Schema.String,
  entityId: Schema.String.pipe(Schema.fromBrand(EntityId)),
  index: Schema.String,
  typeOf: Schema.Struct({
    currentVersion: Schema.Struct({
      version: Schema.Struct({
        id: Schema.String.pipe(Schema.fromBrand(EntityId)),
        entityId: Schema.String.pipe(Schema.fromBrand(EntityId)),
        name: Schema.NullOr(Schema.String),
      }),
    }),
  }),
  fromEntity: Schema.Struct({
    currentVersion: Schema.Struct({
      version: Schema.Struct({
        id: Schema.String.pipe(Schema.fromBrand(EntityId)),
        entityId: Schema.String.pipe(Schema.fromBrand(EntityId)),
        name: Schema.NullOr(Schema.String),
      }),
    }),
  }),
  toEntity: Schema.Struct({
    currentVersion: Schema.Struct({
      version: Schema.Struct({
        id: Schema.String.pipe(Schema.fromBrand(EntityId)),
        entityId: Schema.String.pipe(Schema.fromBrand(EntityId)),
        name: Schema.NullOr(Schema.String),
        versionTypes: SubstreamVersionTypes,

        // Currently our relation query only returns triples where the value type is URL
        triples: Schema.Struct({
          nodes: Schema.Array(SubstreamTriple),
        }),
      }),
    }),
  }),
});

export type SubstreamRelationLive = Schema.Schema.Type<typeof SubstreamRelationLive>;

export const SubstreamVersion = Schema.Struct({
  id: Schema.String.pipe(Schema.fromBrand(EntityId)),
  entityId: Schema.String.pipe(Schema.fromBrand(EntityId)),
  name: Schema.NullOr(Schema.String),
  description: Schema.NullOr(Schema.String),
  versionSpaces: Schema.Struct({
    nodes: Schema.Array(
      Schema.Struct({
        spaceId: Schema.String,
      })
    ),
  }),
  versionTypes: SubstreamVersionTypes,
  relationsByFromVersionId: Schema.Struct({
    nodes: Schema.Array(SubstreamRelationLive),
  }),
  triples: Schema.Struct({
    nodes: Schema.Array(SubstreamTriple),
  }),
});

export type SubstreamVersion = Schema.Schema.Type<typeof SubstreamVersion>;

export const SubstreamVersionHistorical = Schema.Struct({
  id: Schema.String.pipe(Schema.fromBrand(EntityId)),
  entityId: Schema.String.pipe(Schema.fromBrand(EntityId)),
  name: Schema.NullOr(Schema.String),
  description: Schema.NullOr(Schema.String),
  versionSpaces: Schema.Struct({
    nodes: Schema.Array(
      Schema.Struct({
        spaceId: Schema.String,
      })
    ),
  }),
  versionTypes: SubstreamVersionTypes,
  relationsByFromVersionId: Schema.Struct({
    nodes: Schema.Array(SubstreamRelationHistorical),
  }),
  triples: Schema.Struct({
    nodes: Schema.Array(SubstreamTriple),
  }),
  edit: Schema.Struct({
    id: Schema.String,
    name: Schema.String,
    createdAt: Schema.Number,
    createdById: Schema.String,
    proposals: Schema.Struct({
      nodes: Schema.Array(
        Schema.Struct({
          id: Schema.String,
        })
      ),
    }),
  }),
});

export type SubstreamVersionHistorical = Schema.Schema.Type<typeof SubstreamVersionHistorical>;

/**
 * Entities
 */
export const SubstreamEntityLive = Schema.Struct({
  id: Schema.String.pipe(Schema.fromBrand(EntityId)),
  currentVersion: Schema.Struct({
    version: Schema.Struct({
      id: Schema.String.pipe(Schema.fromBrand(EntityId)),
      name: Schema.NullOr(Schema.String),
      description: Schema.NullOr(Schema.String),
      versionSpaces: Schema.Struct({
        nodes: Schema.Array(
          Schema.Struct({
            spaceId: Schema.String,
          })
        ),
      }),
      versionTypes: SubstreamVersionTypes,
      relationsByFromVersionId: Schema.Struct({
        nodes: Schema.Array(SubstreamRelationLive),
      }),
      triples: Schema.Struct({
        nodes: Schema.Array(SubstreamTriple),
      }),
    }),
  }),
});

export type SubstreamEntityLive = Schema.Schema.Type<typeof SubstreamEntityLive>;

export const SubstreamEntityHistorical = Schema.Struct({
  id: Schema.String.pipe(Schema.fromBrand(EntityId)),
  currentVersion: Schema.Struct({
    version: Schema.Struct({
      id: Schema.String.pipe(Schema.fromBrand(EntityId)),
      name: Schema.NullOr(Schema.String),
      description: Schema.NullOr(Schema.String),
      versionSpaces: Schema.Struct({
        nodes: Schema.Array(
          Schema.Struct({
            spaceId: Schema.String,
          })
        ),
      }),
      versionTypes: SubstreamVersionTypes,
      relationsByFromVersionId: Schema.Struct({
        nodes: Schema.Array(SubstreamRelationHistorical),
      }),
      triples: Schema.Struct({
        nodes: Schema.Array(SubstreamTriple),
      }),
    }),
  }),
});

export type SubstreamEntityHistorical = Schema.Schema.Type<typeof SubstreamEntityHistorical>;

// @TODO: Including the metadata makes the schema circular when defining triples
// and entities which is not allowed atm.For now we make a separate schema entry
// to not include the metadata the nextend it here to include the metadata.
//
// If you want metadata with the space then SubstreamSpace should be the schema
// used throughout the app.
export const SubstreamSpace = Schema.extend(
  SubstreamSpaceWithoutMetadata,
  Schema.Struct({
    spacesMetadatum: Schema.Struct({
      version: SubstreamVersion,
    }),
  })
);

export type SubstreamSpace = Schema.Schema.Type<typeof SubstreamSpace>;

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
    spacesMetadatum: Schema.Struct({
      version: SubstreamVersion,
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
export const SubstreamSearchResult = Schema.Struct({
  id: Schema.String.pipe(Schema.fromBrand(EntityId)),
  currentVersion: Schema.Struct({
    version: Schema.Struct({
      id: Schema.String.pipe(Schema.fromBrand(EntityId)),
      name: Schema.NullOr(Schema.String),
      description: Schema.NullOr(Schema.String),
      versionTypes: SubstreamVersionTypes,
      versionSpaces: Schema.Struct({
        nodes: Schema.Array(Schema.Struct({ space: SubstreamSpace })),
      }),
    }),
  }),
});

export type SubstreamSearchResult = Schema.Schema.Type<typeof SubstreamSearchResult>;

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
  accountId: Account,
});

export type SubstreamVote = Schema.Schema.Type<typeof SubstreamVote>;

export const SubstreamSpaceEntityConfig = Schema.Struct({
  id: Schema.String.pipe(Schema.fromBrand(SpaceId)),
  spacesMetadatum: Schema.Struct({
    version: SubstreamVersion,
  }),
});

export type SubstreamSpaceConfigEntityConfig = Schema.Schema.Type<typeof SubstreamSpaceEntityConfig>;

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
  type: ProposalType,
  onchainProposalId: Schema.String,
  createdById: AddressWithValidation,
  space: SubstreamSpaceEntityConfig,
  startTime: Schema.Number,
  endTime: Schema.Number,
  status: ProposalStatus,
  edit: Schema.NullOr(
    Schema.Struct({
      id: Schema.String.pipe(Schema.fromBrand(EntityId)),
      name: Schema.String,
      createdAt: Schema.Number,
      createdAtBlock: Schema.String,
    })
  ),
  proposalVotes: Schema.Struct({
    nodes: Schema.Array(SubstreamVote),
    totalCount: Schema.Number,
  }),
});

export type SubstreamProposal = Schema.Schema.Type<typeof SubstreamProposal>;
