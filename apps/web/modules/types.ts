export type TripleNumberValue = {
  numberValue: string;
  valueType: 'NUMBER';
};

export type TripleStringValue = {
  stringValue: string;
  valueType: 'STRING';
};

export type TripleEntityValue = {
  entityValue: { id: string };
  valueType: 'ENTITY';
};

export type TripleValue = TripleNumberValue | TripleStringValue | TripleEntityValue;

export type ITriple = TripleValue & {
  id: string;
  entity: {
    id: string;
  };
  attribute: {
    id: string;
  };
};

export type Identifable = {
  id: string;
};
