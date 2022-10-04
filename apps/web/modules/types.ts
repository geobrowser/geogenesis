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
  changed?: ChangeType;
};

export type Identifable = {
  id: string;
};

export type ChangeType = 'created' | 'edited';
