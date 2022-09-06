import {Value} from '.';
import * as dagCBOR from '@ipld/dag-cbor';
import {CID} from 'multiformats';
import {keySort} from './util';

export type Sha256Hasher = (bytes: Uint8Array) => Promise<Uint8Array>;

export const serialize = async (
  hasher: Sha256Hasher,
  value: Value
): Promise<Array<Uint8Array>> => {
  const state = {
    hasher,
    chunks: new Array<Uint8Array>(),
  };
  const root = await serializeValue(state, value);
  state.chunks.push(dagCBOR.encode(root));
  return state.chunks;
};

interface State {
  hasher: Sha256Hasher;
  chunks: Array<Uint8Array>;
}

const serializeValue = async (state: State, value: Value): Promise<unknown> => {
  if (value === null || typeof value == 'boolean') return value;
  if (typeof value == 'number') return serializeNumber(state, value);
  if (typeof value == 'string') return serializeString(state, value);
  if (value instanceof Uint8Array) return serializeBytes(state, value);
  if (Array.isArray(value)) return serializeArray(state, value);
  return serializeObject(state, value);
};

const serializeNumber = (_: State, value: number): unknown => {
  if (!Number.isInteger(value)) throw `unexpected float: ${value}`;
  return value;
};

const serializeString = async (
  state: State,
  value: string
): Promise<unknown> => {
  if (value.length <= 32) return value;
  // TODO: split into blocks <= 1MiB
  const chunk = dagCBOR.encode(value);
  state.chunks.push(chunk);
  const digest = await state.hasher(chunk);
  return cid(digest);
};

const serializeBytes = async (
  state: State,
  value: Uint8Array
): Promise<unknown> => {
  if (value.length <= 32) return value;
  // TODO: split into blocks <= 1MiB
  const chunk = dagCBOR.encode(value);
  state.chunks.push(chunk);
  const digest = await state.hasher(chunk);
  return cid(digest);
};

const serializeArray = (state: State, value: Array<Value>): Promise<unknown> =>
  // TODO: Persistent Vec or RRB
  Promise.all(value.map(v => serializeValue(state, v)));

const serializeObject = async (
  state: State,
  value: {[key: string]: Value}
): Promise<unknown> =>
  Promise.all(
    Object.keys(value)
      .sort(keySort)
      .map(async k => [k, await serializeValue(state, value[k])])
  ).then(Object.fromEntries);

const cid = (digest: Uint8Array): CID =>
  CID.createV1(dagCBOR.code, {
    code: 0x12,
    digest,
    size: digest.length,
    bytes: Buffer.concat([Uint8Array.from([0x12, 0x20]), digest]),
  });
