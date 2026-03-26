import { keccak256, stringToHex } from 'viem';
import { describe, expect, it } from 'vitest';

import { encodeEntityVoteData, encodeEntityVoteTopic } from './entity-vote';
import { PERMISSIONLESS_ACTIONS } from './space-registry';

const ENTITY_ID = 'a19c345ab9866679b001d7d2138d88a1';
const SPACE_ID = 'deadbeef0000111122223333444455aa';
const PERSONAL_SPACE_ID = 'cafebabe1234567890abcdef00112233';

describe('PERMISSIONLESS_ACTIONS', () => {
  it('UPVOTED matches keccak256("PERMISSIONLESS.UPVOTED")', () => {
    const expected = keccak256(stringToHex('PERMISSIONLESS.UPVOTED'));
    expect(PERMISSIONLESS_ACTIONS.UPVOTED).toBe(expected);
  });

  it('DOWNVOTED matches keccak256("PERMISSIONLESS.DOWNVOTED")', () => {
    const expected = keccak256(stringToHex('PERMISSIONLESS.DOWNVOTED'));
    expect(PERMISSIONLESS_ACTIONS.DOWNVOTED).toBe(expected);
  });

  it('UNVOTED matches keccak256("PERMISSIONLESS.UNVOTED")', () => {
    const expected = keccak256(stringToHex('PERMISSIONLESS.UNVOTED'));
    expect(PERMISSIONLESS_ACTIONS.UNVOTED).toBe(expected);
  });
});

describe('encodeEntityVoteTopic', () => {
  it('produces a 32-byte (66-char) hex string', () => {
    const topic = encodeEntityVoteTopic(ENTITY_ID);
    expect(topic.startsWith('0x')).toBe(true);
    expect(topic.length).toBe(66);
  });

  it('encodes entity objectType as 0x00000000 in bytes 0-3', () => {
    const topic = encodeEntityVoteTopic(ENTITY_ID, 0);
    expect(topic.slice(2, 10)).toBe('00000000');
  });

  it('encodes relation objectType as 0x00000001 in bytes 0-3', () => {
    const topic = encodeEntityVoteTopic(ENTITY_ID, 1);
    expect(topic.slice(2, 10)).toBe('00000001');
  });

  it('encodes the entityId in bytes 4-19', () => {
    const topic = encodeEntityVoteTopic(ENTITY_ID, 0);
    expect(topic.slice(10, 42)).toBe(ENTITY_ID);
  });

  it('fills the remaining 12 bytes (chars 42-65) with zeros', () => {
    const topic = encodeEntityVoteTopic(ENTITY_ID, 0);
    expect(topic.slice(42)).toBe('0'.repeat(24));
  });

  it('strips dashes from UUID-formatted entity IDs', () => {
    const uuidEntityId = 'a19c345a-b986-6679-b001-d7d2138d88a1';
    const topic = encodeEntityVoteTopic(uuidEntityId, 0);
    expect(topic.slice(10, 42)).toBe(ENTITY_ID);
  });

  it('is lowercase', () => {
    const upperEntityId = 'A19C345AB9866679B001D7D2138D88A1';
    const topic = encodeEntityVoteTopic(upperEntityId, 0);
    expect(topic.slice(10, 42)).toBe(ENTITY_ID);
  });

  it('throws for an entity ID that is too short', () => {
    expect(() => encodeEntityVoteTopic('abc123')).toThrow();
  });

  it('throws for an entity ID that is too long', () => {
    expect(() => encodeEntityVoteTopic(ENTITY_ID + 'ff')).toThrow();
  });
});

describe('encodeEntityVoteData', () => {
  it('produces a valid hex string starting with 0x', () => {
    const data = encodeEntityVoteData(PERSONAL_SPACE_ID, SPACE_ID);
    expect(data.startsWith('0x')).toBe(true);
  });

  it('produces exactly 96 bytes', () => {
    const data = encodeEntityVoteData(PERSONAL_SPACE_ID, SPACE_ID);
    expect(data.length).toBe(2 + 192);
  });

  it('encodes version=0 as the first 32-byte slot', () => {
    const data = encodeEntityVoteData(PERSONAL_SPACE_ID, SPACE_ID, 0);
    const slot0 = data.slice(2, 66);
    expect(slot0).toBe('0'.repeat(64));
  });

  it('encodes a non-zero version correctly', () => {
    const data = encodeEntityVoteData(PERSONAL_SPACE_ID, SPACE_ID, 1);
    const slot0 = data.slice(2, 66);
    expect(slot0).toBe('0'.repeat(60) + '0001');
  });

  it('encodes personalSpaceId in the second 32-byte slot', () => {
    const data = encodeEntityVoteData(PERSONAL_SPACE_ID, SPACE_ID);
    const slot1 = data.slice(66, 130);
    expect(slot1).toBe(PERSONAL_SPACE_ID + '0'.repeat(32));
  });

  it('encodes spaceId in the third 32-byte slot', () => {
    const data = encodeEntityVoteData(PERSONAL_SPACE_ID, SPACE_ID);
    const slot2 = data.slice(130, 194);
    expect(slot2).toBe(SPACE_ID + '0'.repeat(32));
  });

  it('strips dashes from UUID-formatted space IDs', () => {
    const uuidPersonal = 'cafebabe-1234-5678-90ab-cdef00112233';
    const uuidSpace = 'deadbeef-0000-1111-2222-3333444455aa';
    const data = encodeEntityVoteData(uuidPersonal, uuidSpace);
    const slot1 = data.slice(66, 130);
    expect(slot1).toBe(PERSONAL_SPACE_ID + '0'.repeat(32));
  });

  it('throws for a personalSpaceId that is too short', () => {
    expect(() => encodeEntityVoteData('abc', SPACE_ID)).toThrow();
  });

  it('throws for a spaceId that is too short', () => {
    expect(() => encodeEntityVoteData(PERSONAL_SPACE_ID, 'abc')).toThrow();
  });
});
