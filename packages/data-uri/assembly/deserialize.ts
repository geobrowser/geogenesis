import {CID} from './cid';
import {
  ByteArray,
  Bytes,
  ipfs,
  log,
  typeConversion,
  TypedMap,
  TypedMapEntry,
} from '@graphprotocol/graph-ts';
import {IPLDValue, IPLDValueKind} from './value';

export function deserialize(chunks: Array<Uint8Array>): IPLDValue {
  const deque = new Array<IPLDValue>();
  for (let i: i32 = 0; i < chunks.length; i++) {
    const bytes = Bytes.fromUint8Array(chunks[i]);
    log.debug(`deserialize ${bytes.length}`, []);
    const result = deserializeValue(deque, bytes);
    assert(
      result.rest.length === 0,
      `input bytes not deserialized: ${result.rest.length}`
    );
    deque.push(result.value);
  }
  assert(deque.length === 1, 'missing chunk');
  return deque[0];
}

class ParseResult<T> {
  value: T;
  rest: ByteArray;

  constructor(value: T, rest: ByteArray) {
    this.value = value;
    this.rest = rest;
  }

  map<U>(f: (value: T) => U): ParseResult<U> {
    return new ParseResult(f(this.value), this.rest);
  }
}

function subBytes(bytes: ByteArray, begin: i32, end: i32 = -1): ByteArray {
  return end === -1
    ? Bytes.fromUint8Array(bytes.slice(begin))
    : Bytes.fromUint8Array(bytes.slice(begin, end));
}

function deserializeValue(
  deque: Array<IPLDValue>,
  bytes: ByteArray
): ParseResult<IPLDValue> {
  // See RFC 8949 Appendix B.
  switch (bytes[0] & 0xf0) {
    // unsigned integer
    case 0x00:
    case 0x10: {
      return deserializeUInt(bytes).map<IPLDValue>(IPLDValue.fromI64);
    }
    // negative integer
    case 0x20:
    case 0x30: {
      return deserializeUInt(bytes).map<IPLDValue>(n =>
        IPLDValue.fromI64(-1 - n)
      );
    }
    // byte string
    case 0x40:
    case 0x50: {
      const len = deserializeUInt(bytes);
      const value = IPLDValue.fromBytes(
        Bytes.fromByteArray(subBytes(len.rest, 0, len.value as i32))
      );
      return new ParseResult(value, subBytes(len.rest, len.value as i32));
    }
    // UTF-8 string
    case 0x60:
    case 0x70: {
      const len = deserializeUInt(bytes);
      const value = IPLDValue.fromString(
        typeConversion.bytesToString(len.rest.subarray(0, len.value as i32))
      );
      return new ParseResult(value, subBytes(len.rest, len.value as i32));
    }
    // array
    case 0x80:
    case 0x90: {
      const len = deserializeUInt(bytes);
      const entries = new Array<IPLDValue>();
      let rest = len.rest;
      for (let i = 0; i < (len.value as i32); i++) {
        const result = deserializeValue(deque, rest);
        rest = result.rest;
        entries.push(result.value);
      }
      return new ParseResult(IPLDValue.fromArray(entries), rest);
    }
    // map
    case 0xa0:
    case 0xb0: {
      const len = deserializeUInt(bytes);
      const map = new TypedMap<string, IPLDValue>();
      let rest = len.rest;
      for (let i = 0; i < (len.value as i32); i++) {
        const result = deserializeEntry(deque, rest);
        rest = result.rest;
        map.set(result.value.key, result.value.value);
      }
      return new ParseResult(IPLDValue.fromMap(map), rest);
    }
    // tag
    case 0xd0: {
      assert(
        bytes[0] === 0xd8 && bytes[1] === 0x2a,
        `unexpected bytes: ${subBytes(bytes, 0, 2).toHex()}`
      );
      return deserializeCID(deque, subBytes(bytes, 2));
    }
    case 0xf0: {
      if (bytes[0] === 0xf4)
        return new ParseResult(IPLDValue.fromBool(false), subBytes(bytes, 1));
      if (bytes[0] === 0xf5)
        return new ParseResult(IPLDValue.fromBool(true), subBytes(bytes, 1));
      if (bytes[0] === 0xf6)
        return new ParseResult(IPLDValue.fromNull(), subBytes(bytes, 1));

      throw `unexpected bytes: ${subBytes(bytes, 0, 1).toHex()}`;
    }
    // unexpected
    default:
      throw `unexpected bytes: ${subBytes(bytes, 0, 1).toHex()}`;
  }
}

function deserializeUInt(bytes: ByteArray): ParseResult<u64> {
  const pattern = bytes[0] & 0x1f;
  if (pattern <= 0x17) return new ParseResult(pattern, subBytes(bytes, 1));
  assert(pattern !== 0x1f, 'TODO: variable length');
  assert(pattern <= 0x1b, `unexpected bytes: ${subBytes(bytes, 0, 1).toHex()}`);
  const lenSize: u8 = (1 as u8) << (pattern - 0x18);
  let uint: u64 = 0;
  for (let i: u8 = 1; i <= lenSize; i++) {
    uint += (bytes[i] as u64) << ((lenSize - i) * 8);
  }
  return new ParseResult(uint, subBytes(bytes, lenSize + 1));
}

function deserializeEntry(
  deque: Array<IPLDValue>,
  bytes: ByteArray
): ParseResult<TypedMapEntry<string, IPLDValue>> {
  const key = deserializeValue(deque, bytes);
  assert(
    key.value.kind == IPLDValueKind.STRING,
    `unexpected key type: ${key.value.kind}`
  );
  const value = deserializeValue(deque, key.rest);
  const entry = new TypedMapEntry<string, IPLDValue>(
    key.value.toString(),
    value.value
  );
  return new ParseResult(entry, value.rest);
}

function deserializeCID(
  deque: Array<IPLDValue>,
  bytes: ByteArray
): ParseResult<IPLDValue> {
  const inner = deserializeValue(deque, bytes);
  assert(
    inner.value.kind == IPLDValueKind.BYTES,
    `unexpected CID type: ${inner.value.kind}`
  );
  const cidBytes = inner.value.toBytes();
  assert(
    cidBytes[0] === 0x00,
    `unexpected CID prefix: ${subBytes(cidBytes, 0, 1).toHex()}`
  );
  assert(
    cidBytes[1] === 0x01,
    `unexpected CID version: ${subBytes(cidBytes, 1, 2).toHex()}`
  );
  assert(
    cidBytes[2] === 0x71,
    `unexpected multicodec: ${subBytes(cidBytes, 2, 3).toHex()}`
  );
  assert(
    cidBytes[3] === 0x12,
    `unexpected multihash: ${subBytes(cidBytes, 3, 4).toHex()}`
  );
  assert(
    cidBytes[4] === 0x20,
    `unexpected digest length: ${subBytes(cidBytes, 4, 5).toHex()}`
  );
  const digest = subBytes(cidBytes, 5);
  assert(digest.length === 0x20, `invalid digest length: ${digest.length}`);
  const cid = new CID(digest);
  assert(deque.length !== 0, `missing block at ${cid.toString()}`);
  const value = deque.shift();
  return new ParseResult(value, inner.rest);
}
