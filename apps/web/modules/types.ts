import {
  CreateTripleAction as CreateTripleActionSchema,
  DeleteTripleAction as DeleteTripleActionSchema,
} from '@geogenesis/action-schema';

export type Dictionary<K extends string, T> = Partial<Record<K, T>>;
export type OmitStrict<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>;

export type TripleValueType = 'number' | 'string' | 'entity';

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

export type Value = NumberValue | StringValue | EntityValue;

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
};

export type Account = {
  id: string;
};

export type ReviewState = 'idle' | 'reviewing' | 'publishing-ipfs' | 'publishing-contract' | 'publish-complete';

export type FilterField = 'entity-id' | 'entity-name' | 'attribute-id' | 'attribute-name' | 'value' | 'linked-to';

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
  types: string[];
  triples: Triple[];
  nameTripleSpace?: string;
};

export interface Column {
  id: string;
  name: string;
}

export interface Cell {
  columnId: string;
  entityId: string;
  triples: Triple[];
}

export type Row = Record<string, Cell>;
