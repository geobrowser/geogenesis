export type NumberValue = {
  value: string;
  type: 'number';
};

export type StringValue = {
  value: string;
  type: 'string';
};

export type EntityValue = {
  value: string;
  type: 'entity';
};

export type Value = NumberValue | StringValue | EntityValue;

// id -> name
export type EntityNames = Record<string, string | null>;

export type Triple = {
  id: string;
  entityId: string;
  attributeId: string;
  value: Value;
  status?: ChangeType;
};

export type TripleChange = Triple & {
  status?: ChangeType;
};

export type Identifable = {
  id: string;
};

// the deleted flag is to denote how we create the Action for the contract.
// Right now an edit is a delete and create, so we have to track the new triple
// and the old one.
export type ChangeType = 'created' | 'edited' | 'deleted';

export type ReviewState = 'idle' | 'reviewing' | 'publishing-ipfs' | 'publishing-contract' | 'publish-complete';
