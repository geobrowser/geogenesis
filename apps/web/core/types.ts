import { ProposalStatus, ProposalType, SYSTEM_IDS } from '@geogenesis/sdk';

import { SubstreamEntity } from '~/core/io/subgraph/network-local-mapping';

export type Dictionary<K extends string, T> = Partial<Record<K, T>>;
export type OmitStrict<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>;

export type ValueType =
  | 'TEXT'
  | 'NUMBER'
  | 'ENTITY'
  | 'COLLECTION'
  | 'CHECKBOX'
  | 'URL'
  | 'TIME'
  // IMAGE is only a value type in the web app. It's modeled as an Entity on the server,
  // but we create a "helper" value type to map the contents of the image to a more
  // ergnomic way of rendering it.
  | 'IMAGE';

export type AppValue = {
  type: 'TEXT' | 'NUMBER' | 'URL' | 'TIME';
  value: string;
};

export type AppEntityValue = {
  type: 'ENTITY';
  value: string;
  name: string | null;

  // Time to link
  // upsert: entity value type, in the value you just add the space the user selected
  space?: string;
};

// Images are stored as an entity instead of the actual image resource url.
// This is so we can add additional metadata about the image to the entity
// representing the image, e.g., image type, dimensions, etc.
//
// In the app we want to be able to easily render the actual image contents
// so we store it as `.image` on the value itself. At publish time this
// helper property is ignored in favor of just the entity's id which is
// stored in the `value` property.
export type AppImageValue = {
  type: 'IMAGE';
  value: string; // id of the entity that stores the image source
  image: string; // the image source itself
};

export type AppCollectionValue = {
  type: 'COLLECTION';
  value: string;
  items: CollectionItem[];
};

export type AppCheckboxValue = {
  type: 'CHECKBOX';
  value: string; // @TODO: Really it's a boolean
};

export type Value = AppEntityValue | AppCollectionValue | AppCheckboxValue | AppImageValue | AppValue;

export type SetTripleAppOp = {
  type: 'SET_TRIPLE';
  id: string;
  attributeId: string;
  entityId: string;
  attributeName: string | null;
  entityName: string | null;
  value: Value;
};

export type DeleteTripleAppOp = {
  type: 'DELETE_TRIPLE';
  id: string;
  attributeId: string;
  entityId: string;
  attributeName: string | null;
  entityName: string | null;
  value: Value;
};

export type AppOp = SetTripleAppOp | DeleteTripleAppOp;

export type Triple = {
  space: string;
  entityId: string;
  attributeId: string;
  value: Value;

  entityName: string | null;
  attributeName: string | null;

  // We have a set of application-specific metadata that we attach to each local version of a triple.
  id?: string; // `${spaceId}:${entityId}:${attributeId}`
  placeholder?: boolean;
  // We keep published triples optimistically in the store. It can take a while for the blockchain
  // to process our transaction, then a few seconds for the subgraph to pick it up and index it.
  // We keep the published triples so we can continue to render them locally while the backend
  // catches up.
  hasBeenPublished?: boolean;
  timestamp?: string; // ISO-8601
  isDeleted?: boolean;
};

export type TripleWithSpaceMetadata = {
  space: SpaceMetadata;
  entityId: string;
  attributeId: string;
  value: Value;

  entityName: string | null;
  attributeName: string | null;

  // We have a set of application-specific metadata that we attach to each local version of a triple.
  id?: string; // `${spaceId}:${entityId}:${attributeId}`
  placeholder?: boolean;
  // We keep published triples optimistically in the store. It can take a while for the blockchain
  // to process our transaction, then a few seconds for the subgraph to pick it up and index it.
  // We keep the published triples so we can continue to render them locally while the backend
  // catches up.
  hasBeenPublished?: boolean;
  timestamp?: string; // ISO-8601
  isDeleted?: boolean;
};

export type SpaceMetadata = {
  id: string;
  name: string;
  metadata: {
    nodes: SubstreamEntity[];
  };
};

export type SpaceConfigEntity = Entity & {
  spaceId: string;
  image: string;
};

export type Space = {
  id: string;
  type: SpaceGovernanceType;
  isRootSpace: boolean;
  daoAddress: string;
  mainVotingPluginAddress: string | null;
  memberAccessPluginAddress: string | null;
  personalSpaceAdminPluginAddress: string | null;
  spacePluginAddress: string;
  editors: string[];
  members: string[];
  spaceConfig: SpaceConfigEntity | null;
  createdAtBlock: string;
};

export type SpaceWithMetadata = {
  id: string;
  name: string | null;
  image: string;
};

export type Account = {
  id: string;
};

export type ReviewState =
  | 'idle'
  | 'reviewing'
  | 'publishing-ipfs'
  | 'signing-wallet'
  | 'publishing-contract'
  | 'publish-complete'
  | 'publish-error';

export type FilterField =
  | 'entity-id'
  | 'entity-name'
  | 'attribute-id'
  | 'attribute-name'
  | 'value'
  | 'linked-to'
  | 'starts-with'
  | 'not-space-id';

export type FilterClause = {
  field: FilterField;
  value: string;
};

export type FilterState = FilterClause[];

export type ValueTypeId =
  | typeof SYSTEM_IDS.TEXT
  | typeof SYSTEM_IDS.RELATION
  | typeof SYSTEM_IDS.IMAGE
  | typeof SYSTEM_IDS.DATE
  | typeof SYSTEM_IDS.WEB_URL;

// export type Schema = {
//   id: string;
//   name: string | null;
//   valueType: {
//     id: string;
//     name: string | null;
//   };
// };

export type Entity = {
  id: string;
  name: string | null;
  description: string | null;
  types: EntitySearchResult[];
  triples: Triple[];
  nameTripleSpaces?: string[];
};

export type GeoType = {
  entityId: string;
  entityName: string | null;
  space: string;
};

export type EntitySearchResult = {
  id: string;
  name: string | null;
};

// A column in the table _is_ an Entity. It's a reference to a specific Attribute entity.
// In this use case we don't really care about description, types, etc.
export interface Column {
  id: string;
  triples: Triple[];
}

export interface Cell {
  columnId: string;
  entityId: string;
  triples: Triple[];
}

export type Row = Record<string, Cell>;

export type Vote = {
  vote: 'ACCEPT' | 'REJECT';
  account: {
    id: string;
  };
  voter: Profile;
};

export type Proposal = {
  id: string;
  type: ProposalType;
  onchainProposalId: string;
  name: string | null;
  description: string | null;
  createdBy: Profile;
  createdAt: number;
  createdAtBlock: string;
  proposedVersions: ProposedVersion[];
  space: SpaceWithMetadata;
  startTime: number;
  endTime: number;
  status: ProposalStatus;
  proposalVotes: {
    totalCount: number;
    nodes: Vote[];
  };
};

export type Version = {
  id: string;
  name: string | null;
  description: string | null;
  createdBy: Profile;
  createdAt: number;
  createdAtBlock: string;
  space: SpaceWithMetadata;
  triples: Triple[];
  entity: {
    id: string;
    name: string;
  };
};

export type ProposedVersion = {
  id: string;
  description: string | null;
  createdBy: Profile;
  createdAt: number;
  createdAtBlock: string;
  space: SpaceWithMetadata;
  ops: AppOp[];
  entity: {
    id: string;
    name: string;
  };
};

export type Profile = {
  id: string;
  name: string | null;
  avatarUrl: string | null;
  coverUrl: string | null;
  profileLink: string | null;
  address: `0x${string}`;
};

export type AppEnv = 'development' | 'testnet' | 'production';

export type RelationValueType = {
  typeId: string;
  typeName: string | null;
  spaceIdOfAttribute: string;
};

export type RelationValueTypesByAttributeId = Record<string, Array<RelationValueType>>;

export type TripleWithStringValue = OmitStrict<Triple, 'value'> & { value: Value };
export type TripleWithEntityValue = OmitStrict<Triple, 'value'> & { value: AppEntityValue };
export type TripleWithImageValue = OmitStrict<Triple, 'value'> & { value: Value };
export type TripleWithDateValue = OmitStrict<Triple, 'value'> & { value: Value };
export type TripleWithUrlValue = OmitStrict<Triple, 'value'> & { value: Value };
export type TripleWithCollectionValue = OmitStrict<Triple, 'value'> & { value: AppCollectionValue };

export type SpaceId = string;
export type SpaceTriples = Record<SpaceId, Triple[]>;

export type EntityId = string;
export type AttributeId = string;
export type EntityActions = Record<EntityId, Record<AttributeId, Triple>>;

export type SpaceType =
  | 'default'
  | 'company'
  | 'nonprofit'
  | 'personal'
  | 'academic-field'
  | 'region'
  | 'industry'
  | 'protocol'
  | 'dao'
  | 'government-org'
  | 'interest-group';
export type SpaceGovernanceType = 'PUBLIC' | 'PERSONAL';

export type CollectionItem = {
  id: string; // id of the collection item entity itself
  collectionId: string; // pointing to the collection referenced by the collection item
  entity: {
    // pointing to the entity referenced by the collection item
    id: string;
    name: string | null;
    types: string[];
  };
  value: {
    type: 'IMAGE' | 'ENTITY';
    // either the name of the thing we're rendering or the image or null in the  case that
    // it's an entity value type but does not have a name
    value: string | null;
  };
  index: string; // the order of the item in the list
};
