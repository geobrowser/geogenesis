import {ByteArray, Bytes} from '@graphprotocol/graph-ts';

export class CID {
  readonly digest: ByteArray;

  static multicodecCode: u8 = 0x71;
  static multicodecName: string = 'dag-cbor';
  static multihashCode: u8 = 0x12;
  static multihashName: string = 'sha2-256';
  static hashSize: u8 = 32;

  constructor(digest: ByteArray) {
    assert(digest.length === CID.hashSize, 'invalid digest');
    this.digest = digest;
  }

  toBytes(): Bytes {
    const prefix = new Uint8Array(4);
    prefix[0] = 1;
    prefix[1] = CID.multicodecCode;
    prefix[2] = CID.multihashCode;
    prefix[3] = CID.hashSize;
    return Bytes.fromUint8Array(prefix).concat(
      Bytes.fromByteArray(this.digest)
    );
  }

  // Multiformat hex string (prefix `f`)
  toString(): string {
    let hex = this.toBytes().toHex().substr(2);
    return `f${hex}`;
  }
}
