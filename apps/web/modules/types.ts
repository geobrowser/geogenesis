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
};

export type Identifable = {
  id: string;
};

export type ChangeType = 'created' | 'edited';

// Do we put all of the triples data in here? It would be faster when it's time to
// actually publish the changes.
export type TripleChange = {
  id: string;
  type: ChangeType;
};
