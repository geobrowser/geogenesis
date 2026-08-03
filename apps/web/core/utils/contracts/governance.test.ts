import { GeoTestnetConfig, createGeoClient } from '@geoprotocol/geo-sdk';
import { describe, expect, it } from 'vitest';

import { decodeAbiParameters, decodeFunctionData, encodeFunctionData, parseAbi } from 'viem';

import { ZERO_ADDRESS, ZERO_SPACE_ID, encodeProposalCreatedData, padBytes16ToBytes32 } from './governance';

const PROPOSAL_DATA_PARAMS = [
  { name: 'proposalId', type: 'bytes16' },
  { name: 'votingMode', type: 'uint8' },
  {
    name: 'actions',
    type: 'tuple[]',
    components: [
      { name: 'toAddress', type: 'address' },
      { name: 'toSpaceId', type: 'bytes16' },
      { name: 'value', type: 'uint256' },
      { name: 'data', type: 'bytes' },
    ],
  },
] as const;

const REGISTRY_ABI = parseAbi(['function enter(bytes16,bytes16,bytes32,bytes32,bytes,bytes)']);

const AUTHOR_SPACE_ID = `0x${'aa'.repeat(16)}` as const;
const DAO_SPACE_ID = `0x${'bb'.repeat(16)}` as const;
const DAO_ADDRESS = '0x1111111111111111111111111111111111111111';

describe('encodeProposalCreatedData', () => {
  // Subspace and DAO-topic proposals are the only two write paths with no SDK helper
  // (geo-sdk 0.20.1 exposes daoSpaces.create/proposeEdit/propose*/voteProposal/
  // executeProposal and nothing for subspaces or topics), so we hand-roll their
  // calldata. This test is what keeps the hand-rolled copy aligned with the SDK.
  it('agrees with the action tuple the SDK itself encodes', () => {
    const geo = createGeoClient({ network: GeoTestnetConfig });

    const { calldata } = geo.daoSpaces.proposeAddEditor({
      authorSpaceId: AUTHOR_SPACE_ID,
      spaceId: DAO_SPACE_ID,
      newEditorSpaceId: AUTHOR_SPACE_ID,
    });

    const { args } = decodeFunctionData({ abi: REGISTRY_ABI, data: calldata as `0x${string}` });

    // Decoding SDK-produced bytes with OUR layout is the actual assertion: if the SDK
    // changes the tuple, this throws, and that failure is the signal to update the
    // encoder before the contracts start reverting with an opaque "out of memory".
    const [, , sdkActions] = decodeAbiParameters(PROPOSAL_DATA_PARAMS, args[4] as `0x${string}`);

    expect(sdkActions.length).toBeGreaterThan(0);
    expect(Object.keys(sdkActions[0])).toEqual(['toAddress', 'toSpaceId', 'value', 'data']);
  });

  it('round-trips an address-targeted action with a zero space id', () => {
    const proposalId = `0x${'ab'.repeat(16)}` as const;
    const pingCallData = encodeFunctionData({
      abi: parseAbi(['function ping(bytes32,bytes32,bytes)']),
      functionName: 'ping',
      args: [`0x${'11'.repeat(32)}`, `0x${'22'.repeat(32)}`, '0x'],
    });

    const encoded = encodeProposalCreatedData(proposalId, 0, [
      { toAddress: DAO_ADDRESS, value: 0n, data: pingCallData },
    ]);

    const [decodedId, votingMode, actions] = decodeAbiParameters(PROPOSAL_DATA_PARAMS, encoded);

    expect(decodedId).toBe(proposalId);
    expect(votingMode).toBe(0);
    expect(actions).toHaveLength(1);
    expect(actions[0].toAddress).toBe(DAO_ADDRESS);
    expect(actions[0].toSpaceId).toBe(ZERO_SPACE_ID);
    expect(actions[0].data).toBe(pingCallData);
  });

  it('round-trips a space-targeted action with a zero address', () => {
    const encoded = encodeProposalCreatedData(`0x${'cd'.repeat(16)}`, 1, [
      { toAddress: ZERO_ADDRESS, toSpaceId: DAO_SPACE_ID, value: 0n, data: '0x' },
    ]);

    const [, votingMode, actions] = decodeAbiParameters(PROPOSAL_DATA_PARAMS, encoded);

    expect(votingMode).toBe(1);
    expect(actions[0].toSpaceId).toBe(DAO_SPACE_ID);
  });

  it('rejects an action targeting both an address and a space', () => {
    expect(() =>
      encodeProposalCreatedData(`0x${'ab'.repeat(16)}`, 0, [
        { toAddress: DAO_ADDRESS, toSpaceId: DAO_SPACE_ID, value: 0n, data: '0x' },
      ])
    ).toThrow('must target either toAddress or toSpaceId, not both');
  });

  it('rejects an action targeting neither', () => {
    expect(() =>
      encodeProposalCreatedData(`0x${'ab'.repeat(16)}`, 0, [{ toAddress: ZERO_ADDRESS, value: 0n, data: '0x' }])
    ).toThrow('must target either toAddress or toSpaceId');
  });
});

describe('padBytes16ToBytes32', () => {
  it('should pad a valid bytes16 hex string to bytes32', () => {
    const input = '1234567890abcdef1234567890abcdef';
    const result = padBytes16ToBytes32(input);

    expect(result).toBe('0x1234567890abcdef1234567890abcdef00000000000000000000000000000000');
    expect(result.length).toBe(66); // 0x + 64 hex chars
  });

  it('should handle input with 0x prefix', () => {
    const input = '0x1234567890abcdef1234567890abcdef';
    const result = padBytes16ToBytes32(input);

    expect(result).toBe('0x1234567890abcdef1234567890abcdef00000000000000000000000000000000');
  });

  it('should handle uppercase hex characters', () => {
    const input = '1234567890ABCDEF1234567890ABCDEF';
    const result = padBytes16ToBytes32(input);

    expect(result).toBe('0x1234567890ABCDEF1234567890ABCDEF00000000000000000000000000000000');
  });

  it('should throw error for too short input', () => {
    const input = '1234567890abcdef'; // Only 16 chars, should be 32

    expect(() => padBytes16ToBytes32(input)).toThrow('Invalid bytes16 hex string: expected 32 hex characters, got 16');
  });

  it('should throw error for too long input', () => {
    const input = '1234567890abcdef1234567890abcdef1234'; // 36 chars, should be 32

    expect(() => padBytes16ToBytes32(input)).toThrow('Invalid bytes16 hex string: expected 32 hex characters, got 36');
  });

  it('should throw error for non-hex characters', () => {
    const input = '1234567890abcdefghijklmnopqrstuv'; // Contains non-hex chars

    expect(() => padBytes16ToBytes32(input)).toThrow('Invalid bytes16 hex string: contains non-hex characters');
  });

  it('should throw error for empty input', () => {
    expect(() => padBytes16ToBytes32('')).toThrow('Invalid bytes16 hex string: expected 32 hex characters, got 0');
  });
});
