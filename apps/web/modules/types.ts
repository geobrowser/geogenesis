export type IFact = {
  id: string;
  entity: {
    id: string;
  };
  attribute: {
    id: string;
  };
  entityValue?: {
    id: string;
  };
  stringValue?: string;
  numberValue?: string;
};

export type Identifable = {
  id: string;
};
