import {
  CreateTripleAction as CreateTripleActionSchema,
  DeleteTripleAction as DeleteTripleActionSchema,
} from '@geogenesis/action-schema';

export type Dictionary<K extends string, T> = Partial<Record<K, T>>;
export type OmitStrict<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>;

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

export type CreateTripleAction = CreateTripleActionSchema & Identifiable & Triple;
export type DeleteTripleAction = DeleteTripleActionSchema & Identifiable & Triple;

export type EditTripleAction = {
  type: 'editTriple';
  before: DeleteTripleAction;
  after: CreateTripleAction;
};

type Identifiable = {
  id: string;
};

export type Action = CreateTripleAction | DeleteTripleAction | EditTripleAction;

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
