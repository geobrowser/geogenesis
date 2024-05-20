import { ProposalStatus, ProposalType } from '@geogenesis/sdk';
import { Op } from '@geogenesis/sdk'
import { SubstreamEntity } from './io/subgraph/network-local-mapping';

export type Dictionary<K extends string, T> = Partial<Record<K, T>>;
export type OmitStrict<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>;

export type ValueType = 'TEXT' | 'NUMBER' | 'ENTITY' | 'COLLECTION' | 'CHECKBOX' | 'URL' | 'TIME' | 'IMAGE';

export type AppValue = {
  type: 'TEXT' | 'NUMBER' | 'COLLECTION' | 'CHECKBOX' | 'URL' | 'TIME' | 'IMAGE';
  value: string;
}

export type AppEntityValue = {
  type: 'ENTITY';
  id: string;
  name: string | null;
};

export type Value = AppEntityValue | AppValue;

export type AppOp = {
  type: Op['type']
  id: string;
  attributeId: string;
  entityId: string;
  attributeName: string | null;
  entityName: string | null;
  value: Value;
}

export type Triple = {
  space: string;
  entityId: string;
  attributeId: string;
  value: Value;

  entityName: string | null;
  attributeName: string | null;
  placeholder?: boolean;
};

export type SpaceConfigEntity = Entity & {
  image: string;
};

export type Space = {
  id: string;
  isRootSpace: boolean;
  mainVotingPluginAddress: string | null;
  memberAccessPluginAddress: string;
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

// We keep published actions optimistically in the store. It can take a while for the blockchain
// to process our transaction, then a few seconds for the subgraph to pick it up and index it.
// We keep the published actions so we can continue to render them locally while the backend catches up.
type Publishable = {
  hasBeenPublished?: boolean;
};

export type Entity = {
  id: string;
  name: string | null;
  description: string | null;
  types: EntityType[];
  triples: Triple[];
  nameTripleSpaces?: string[];
};

export type GeoType = {
  entityId: string;
  entityName: string | null;
  space: string;
};

export type EntityType = {
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
    geoProfiles: { nodes: SubstreamEntity[] };
    onchainProfiles: { nodes: { homeSpaceId: string; id: string }[] };
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
  name: string | null;
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

export type OnchainProfile = {
  id: string;
  homeSpaceId: string;
  accountId: string;
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

export type SpaceId = string;
export type SpaceActions = Record<SpaceId, Op[]>;

export type EntityId = string;
export type AttributeId = string;
export type EntityActions = Record<EntityId, Record<AttributeId, Triple>>;

export type SpaceType = 'default' | 'company' | 'nonprofit';
