import { type Hex, encodeAbiParameters } from 'viem';

export type VoteObjectType = 0 | 1;
export type VoteDirection = 'UP' | 'DOWN' | 'NONE';

// topic layout: [objectType: 4 bytes][objectId: 16 bytes][zeros: 12 bytes]
export function encodeEntityVoteTopic(objectId: string, objectType: VoteObjectType = 0): Hex {
  const normalizedId = objectId.replace(/-/g, '').toLowerCase();
  if (normalizedId.length !== 32) {
    throw new Error(`Invalid objectId: expected 32 hex characters (16 bytes), got ${normalizedId.length}`);
  }
  const objectTypeHex = objectType === 1 ? '00000001' : '00000000';
  return `0x${objectTypeHex}${normalizedId}${'0'.repeat(24)}` as Hex;
}

// The EVM bytes-type wrapper adds a 64-byte header → 160 bytes in the emitted event,
// which is what the hermes-pipeline vote-indexer decodes.
export function encodeEntityVoteData(personalSpaceId: string, spaceId: string, version: number = 0): Hex {
  const normalizedPersonalSpaceId = personalSpaceId.replace(/-/g, '').toLowerCase();
  const normalizedSpaceId = spaceId.replace(/-/g, '').toLowerCase();

  if (normalizedPersonalSpaceId.length !== 32) {
    throw new Error(
      `Invalid personalSpaceId: expected 32 hex characters (16 bytes), got ${normalizedPersonalSpaceId.length}`
    );
  }
  if (normalizedSpaceId.length !== 32) {
    throw new Error(`Invalid spaceId: expected 32 hex characters (16 bytes), got ${normalizedSpaceId.length}`);
  }

  return encodeAbiParameters(
    [{ type: 'uint16' }, { type: 'bytes16' }, { type: 'bytes16' }],
    [version, `0x${normalizedPersonalSpaceId}` as Hex, `0x${normalizedSpaceId}` as Hex]
  );
}
