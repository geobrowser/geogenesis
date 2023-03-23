import {
  CreateTripleAction as CreateTripleActionSchema,
  DeleteTripleAction as DeleteTripleActionSchema,
} from '@geogenesis/action-schema';

export type Dictionary<K extends string, T> = Partial<Record<K, T>>;
export type OmitStrict<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>;

export type TripleValueType = 'number' | 'string' | 'entity' | 'image';

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

export type Value = NumberValue | StringValue | EntityValue | ImageValue;

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

export type Space = {
  id: string;
  isRootSpace: boolean;
  editors: string[];
  editorControllers: string[];
  admins: string[];
  attributes: Dictionary<string, string>;
  entityId: string;
  spaceConfigEntityId: string | null;
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
  | 'publish-complete';

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
} & Publishable;

type Identifiable = {
  id: string;
};

type Publishable = {
  hasBeenPublished?: boolean;
};

export type Action = CreateTripleAction | DeleteTripleAction | EditTripleAction;

export type Entity = {
  id: string;
  name: string | null;
  description: string | null;
  types: { id: string; name: string | null }[];
  triples: Triple[];
  nameTripleSpace?: string;
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

export type Version = {
  id: string;
  name: string;
  description?: string;
  createdBy: Profile;
  createdAt: number;
  actions: Action[];
};

export type Profile = {
  id: string;
  name: string | null;
  avatarUrl: string | null;
};
