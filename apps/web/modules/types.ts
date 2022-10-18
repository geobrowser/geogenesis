export type OmitStrict<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>;

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
  space: string;
};

export type Space = {
  id: string;
};

export type ReviewState = 'idle' | 'reviewing' | 'publishing-ipfs' | 'publishing-contract' | 'publish-complete';
