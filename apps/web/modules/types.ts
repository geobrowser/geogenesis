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

export type Triple = {
  id: string;
  entityId: string;
  attributeId: string;
  value: Value;
  status?: ChangeType;
  // denotes if the local triple has already been changed.
  // We don't want to track every change to every triple,
  // just that it has changed at some point so we can do
  // "deleteTriple" when we publish.
  hasChanged?: boolean;
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
