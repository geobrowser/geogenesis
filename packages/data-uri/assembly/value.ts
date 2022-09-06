import {Bytes, TypedMap} from '@graphprotocol/graph-ts';

export enum IPLDValueKind {
  NULL = 0,
  BOOL = 1,
  I64 = 2,
  STRING = 3,
  BYTES = 4,
  LIST = 5,
  MAP = 6,
}

const stringForKind = (kind: IPLDValueKind): string => {
  if (kind === IPLDValueKind.NULL) {
    return 'NULL';
  } else if (kind === IPLDValueKind.BOOL) {
    return 'BOOL';
  } else if (kind === IPLDValueKind.I64) {
    return 'I64';
  } else if (kind === IPLDValueKind.STRING) {
    return 'STRING';
  } else if (kind === IPLDValueKind.BYTES) {
    return 'BYTES';
  } else if (kind === IPLDValueKind.LIST) {
    return 'LIST';
  } else if (kind === IPLDValueKind.MAP) {
    return 'MAP';
  }
  throw `Unexpected kind: ${kind}`;
};

function assertKind(value: IPLDValue, kind: IPLDValueKind): void {
  assert(
    value.kind == kind,
    `IPLDValue ${
      stringForKind(value.kind)
    } is not ${
      stringForKind(kind)
    } (${
      value.displayData()
    }) .`
  );
  return;
};

export class IPLDValue {
  readonly kind: IPLDValueKind;
  private readonly data: u64;

  private constructor(kind: IPLDValueKind, data: u64) {
    this.kind = kind;
    this.data = data;
  }

  static fromNull(): IPLDValue {
    return new IPLDValue(IPLDValueKind.NULL, 0);
  }

  static fromBool(value: boolean): IPLDValue {
    return new IPLDValue(IPLDValueKind.BOOL, value ? 1 : 0);
  }
  toBool(): boolean {
    assertKind(this, IPLDValueKind.BOOL);
    return this.data != 0;
  }

  static fromI64(value: i64): IPLDValue {
    return new IPLDValue(IPLDValueKind.I64, value as u64);
  }
  toI64(): i64 {
    assertKind(this, IPLDValueKind.I64);
    return this.data as i64;
  }

  static fromString(value: string): IPLDValue {
    return new IPLDValue(IPLDValueKind.STRING, changetype<u32>(value));
  }
  toString(): string {
    assertKind(this, IPLDValueKind.STRING);
    return changetype<string>(this.data as u32);
  }

  static fromBytes(value: Bytes): IPLDValue {
    return new IPLDValue(IPLDValueKind.BYTES, changetype<u32>(value));
  }
  toBytes(): Bytes {
    assertKind(this, IPLDValueKind.BYTES);
    return changetype<Bytes>(this.data as u32);
  }

  static fromArray(value: Array<IPLDValue>): IPLDValue {
    return new IPLDValue(IPLDValueKind.LIST, changetype<u32>(value));
  }
  toArray(): Array<IPLDValue> {
    assertKind(this, IPLDValueKind.LIST);
    return changetype<Array<IPLDValue>>(this.data as u32);
  }

  static fromMap(value: TypedMap<string, IPLDValue>): IPLDValue {
    return new IPLDValue(IPLDValueKind.MAP, changetype<u32>(value));
  }
  toMap(): TypedMap<string, IPLDValue> {
    assertKind(this, IPLDValueKind.MAP);
    return changetype<TypedMap<string, IPLDValue>>(this.data as u32);
  }

  displayData(): string {
    switch (this.kind) {
      case IPLDValueKind.NULL:
        return 'null';
      case IPLDValueKind.BOOL:
        return this.toBool().toString();
      case IPLDValueKind.I64:
        return this.toI64().toString();
      case IPLDValueKind.STRING:
        return '"' + this.toString() + '"';
      case IPLDValueKind.BYTES:
        return this.toBytes().toHexString();
      case IPLDValueKind.LIST: {
        const entries = this.toArray().map<string>(e => e.displayData());
        return '[' + entries.join(', ') + ']';
      }
      case IPLDValueKind.MAP: {
        const map = this.toMap();
        let keys = map.entries.map<string>(e => e.key).sort(keySort);
        const repr = new Array<string>();
        for (let i = 0; i < keys.length; i++) {
          repr.push(`"${keys[i]}"` + ': ' + map.get(keys[i])!.displayData());
        }
        return '{' + repr.join(', ') + '}';
      }
      default:
        throw `Unexpected type: ${stringForKind(this.kind)}`;
    }
  }
}

const keySort = (a: string, b: string): i32 => {
  if (a.length < b.length) return -1;
  if (a.length > b.length) return +1;
  for (let i = 0; i < a.length; i++) {
    if (a.charAt(i) < b.charAt(i)) return -1;
    if (a.charAt(i) > b.charAt(i)) return +1;
  }
  return 0;
};
