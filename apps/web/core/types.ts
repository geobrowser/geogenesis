import {
  CreateTripleAction as CreateTripleActionSchema,
  DeleteTripleAction as DeleteTripleActionSchema,
} from '@geogenesis/action-schema';
import { ProposalStatus } from '@geogenesis/sdk';

export type Dictionary<K extends string, T> = Partial<Record<K, T>>;
export type OmitStrict<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>;

export type TripleValueType = 'number' | 'string' | 'entity' | 'image' | 'date' | 'url';

export type NumberValue = {
  type: 'number';
  id: string;
  value: string;
};

export type StringValue = {
  type: 'string';
  id: string;
  value: string;
};

export type EntityValue = {
  type: 'entity';
  id: string;
  name: string | null;
};

export type ImageValue = {
  type: 'image';
  id: string;
  value: string;
};

export type DateValue = {
  type: 'date';
  id: string;
  value: string;
};

export type UrlValue = {
  type: 'url';
  id: string;
  value: string;
};

export type Value = NumberValue | StringValue | EntityValue | ImageValue | DateValue | UrlValue;

export type Triple = {
  id: string;
  entityId: string;
  entityName: string | null;
  attributeId: string;
  attributeName: string | null;
  value: Value;
  space: string;
  placeholder?: boolean;
};

export type SpaceConfigEntity = Entity & {
  image: string;
};

export type Space = {
  id: string;
  isRootSpace: boolean;
  editors: string[];
  editorControllers: string[];
  admins: string[];
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

export type CreateTripleAction = CreateTripleActionSchema & Identifiable & Triple & Publishable;
export type DeleteTripleAction = DeleteTripleActionSchema & Identifiable & Triple & Publishable;

export type EditTripleAction = {
  type: 'editTriple';
  before: DeleteTripleAction;
  after: CreateTripleAction;
} & Publishable &
  Identifiable;

// We associate an ID with actions locally so we can diff and merge them as they change locally.
type Identifiable = {
  id: string;
};

// We keep published actions optimistically in the store. It can take a while for the blockchain
// to process our transaction, then a few seconds for the subgraph to pick it up and index it.
// We keep the published actions so we can continue to render them locally while the backend catches up.
type Publishable = {
  hasBeenPublished?: boolean;
};

export type Action = CreateTripleAction | DeleteTripleAction | EditTripleAction;

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
  vote: 'YES' | 'NO';
  accountId: string;
};

export type Proposal = {
  id: string;
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
  actions: Action[];
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

export type TripleWithStringValue = OmitStrict<Triple, 'value'> & { value: StringValue };
export type TripleWithEntityValue = OmitStrict<Triple, 'value'> & { value: EntityValue };
export type TripleWithImageValue = OmitStrict<Triple, 'value'> & { value: ImageValue };
export type TripleWithDateValue = OmitStrict<Triple, 'value'> & { value: DateValue };
export type TripleWithUrlValue = OmitStrict<Triple, 'value'> & { value: UrlValue };

export type SpaceId = string;
export type SpaceActions = Record<SpaceId, Action[]>;

export type EntityId = string;
export type AttributeId = string;
export type EntityActions = Record<EntityId, Record<AttributeId, Triple>>;

export type SpaceType = 'default' | 'company' | 'nonprofit';
