import {Value} from '.';
import * as dagCBOR from '@ipld/dag-cbor';
import {CID} from 'multiformats';
import {keySort} from './util';

export const deserialize = (chunks: Array<Uint8Array>): Value => {
  const deque = new Array<Value>();
  chunks.forEach(chunk =>
    deque.push(deserializeValue(deque, dagCBOR.decode(chunk)))
  );
  if (deque.length !== 1) throw 'Missing chunk';
  return deque[0];
};

const deserializeValue = (deque: Array<Value>, value: unknown): Value => {
  switch (typeof value) {
    case 'boolean':
    case 'number':
    case 'string':
      return value;
    case 'object': {
      if (value === null || value instanceof Uint8Array) return value as Value;
      const cid = CID.asCID(value);
      if (cid) return deserializeCID(deque, cid);
      if (Array.isArray(value)) return deserializeArray(deque, value);
      return deserializeObject(deque, value as {[key: string]: unknown});
    }
    default:
      throw `Unexpected value: ${value}`;
  }
};

const deserializeCID = (deque: Array<Value>, value: CID): Value => {
  if (deque.length === 0) throw `Missing chunk at ${value.toString()}`;
  return deque.shift()!;
};

const deserializeArray = (deque: Array<Value>, value: Array<unknown>): Value =>
  value.map(v => deserializeValue(deque, v));

const deserializeObject = (
  deque: Array<Value>,
  value: {[key: string]: unknown}
): Value => {
  const keys = Object.keys(value).sort(keySort);
  return Object.fromEntries(
    keys.map(k => [k, deserializeValue(deque, value[k])])
  );
};
