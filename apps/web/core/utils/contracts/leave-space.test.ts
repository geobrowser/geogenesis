import { decodeAbiParameters, decodeFunctionData, keccak256, stringToHex } from 'viem';
import { describe, expect, it } from 'vitest';

import { encodeLeaveSpaceCall } from './leave-space';
import { SpaceRegistryAbi } from './space-registry';

const registry = '0x1111111111111111111111111111111111111111';
const personalSpaceId = 'B7C1AA0E-3F2D-4C5B-9A8E-7D6C5B4A3F21';
const spaceId = '41e851610e13a19441c4d980f2f2ce6b';

describe('encodeLeaveSpaceCall', () => {
  it('authenticates the personal space through the registry and leaves only the MEMBER role', () => {
    const call = encodeLeaveSpaceCall({ registry, personalSpaceId, spaceId });
    const decoded = decodeFunctionData({ abi: SpaceRegistryAbi, data: call.data });

    expect(call.to).toBe(registry);
    expect(decoded.functionName).toBe('enter');
    if (decoded.functionName !== 'enter') throw new Error('Expected enter');
    const [author, target, action, topic, data, signature] = decoded.args;
    expect(author).toBe('0xb7c1aa0e3f2d4c5b9a8e7d6c5b4a3f21');
    expect(target).toBe(`0x${spaceId}`);
    expect(action).toBe(keccak256(stringToHex('GOVERNANCE.SPACE_LEFT')));
    expect(topic).toBe(`0x${'00'.repeat(32)}`);
    expect(decodeAbiParameters([{ type: 'bytes32' }], data)).toEqual([keccak256(stringToHex('MEMBER'))]);
    expect(signature).toBe('0x');
  });

  it.each([
    { spaceId: 'invalid', personalSpaceId },
    { spaceId, personalSpaceId: 'pending:0xviewer' },
  ])('rejects invalid identities before building a transaction', ids => {
    expect(() => encodeLeaveSpaceCall({ registry, ...ids })).toThrow('Invalid space ID');
  });
});
