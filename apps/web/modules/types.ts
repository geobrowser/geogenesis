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

/**
 * Local triple versions
 *
 * Triple 1
 *    -> changed to Triple 2 (added to TripleVersions array)
 *       create new entry in TriplePosition with the new id and all of the accumulated triples
 *
 */

type TripleVersions = {
  ids: string[];
  versions: Record<string, Triple[]>;
};
