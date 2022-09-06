export * from './serialize';
export * from './deserialize';
export * from './util';

export type Value =
  | {[key: string]: Value}
  | Array<Value>
  | Uint8Array
  | string
  | number
  | boolean
  | null;
