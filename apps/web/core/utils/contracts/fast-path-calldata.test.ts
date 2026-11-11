import { decodeAbiParameters, decodeFunctionData, keccak256, stringToHex } from 'viem';
import { describe, expect, it } from 'vitest';

import { geo } from '~/core/sdk/geo-client';
import { SPACE_REGISTRY_ADDRESS_HEX } from '~/core/sdk/geo-network';

import {
  encodeAddMemberWithFastPathProposal,
  encodeRestrictMemberFastPath,
  encodeUnrestrictMemberProposal,
} from './fast-path-calldata';
import { DAOSpaceAbi, FAST_PATH_RESTRICTED_ROLE, GOVERNANCE_ACTIONS, SpaceRegistryAbi } from './space-registry';

const AUTHOR = '0eed5491b917cf58b33ac81255fe7ae9';
const DAO = 'abcdef12345678901234567890abcdef';
const MEMBER = '22222222222222222222222222222222';
const params = { authorSpaceId: AUTHOR, spaceId: DAO, memberSpaceId: MEMBER };

function decodeEnter(calldata: `0x${string}`) {
  const decoded = decodeFunctionData({ abi: SpaceRegistryAbi, data: calldata });
  expect(decoded.functionName).toBe('enter');
  const [from, to, action, topic, data] = decoded.args as unknown as `0x${string}`[];
  return { from, to, action, topic, data: data as `0x${string}` };
}

function decodeProposal(data: `0x${string}`) {
  const [proposalId, votingMode, actions] = decodeAbiParameters(
    [
      { type: 'bytes16' },
      { type: 'uint8' },
      {
        type: 'tuple[]',
        components: [
          { type: 'address', name: 'toAddress' },
          { type: 'bytes16', name: 'toSpaceId' },
          { type: 'uint256', name: 'value' },
          { type: 'bytes', name: 'data' },
        ],
      },
    ],
    data
  );
  return {
    proposalId,
    votingMode,
    calls: actions.map(a => ({ ...decodeFunctionData({ abi: DAOSpaceAbi, data: a.data }), toSpaceId: a.toSpaceId })),
  };
}

describe('fast-path calldata', () => {
  it('pins the contract hashes it relies on', () => {
    expect(FAST_PATH_RESTRICTED_ROLE).toBe(keccak256(stringToHex('FAST_PATH_RESTRICTED')));
    expect(GOVERNANCE_ACTIONS.SPACE_FAST_PATH_RESTRICTED).toBe(
      keccak256(stringToHex('GOVERNANCE.SPACE_FAST_PATH_RESTRICTED'))
    );
  });

  it('lifts a restriction with a single SLOW unrestrictSpace proposal', () => {
    const result = encodeUnrestrictMemberProposal(params);
    const enter = decodeEnter(result.calldata);
    const { proposalId, votingMode, calls } = decodeProposal(enter.data);

    expect(result.to).toBe(SPACE_REGISTRY_ADDRESS_HEX);
    expect(proposalId).toBe(result.proposalId);
    expect(enter.from).toBe(`0x${AUTHOR}`);
    expect(enter.to).toBe(`0x${DAO}`);
    expect(votingMode).toBe(0);
    expect(calls.map(c => [c.functionName, c.args?.[0], c.toSpaceId])).toEqual([
      ['unrestrictSpace', `0x${MEMBER}`, `0x${DAO}`],
    ]);
  });

  // addMember re-applies the restriction in a space that restricts new members, so it has to run first.
  it('re-adds someone with addMember before unrestrictSpace', () => {
    const result = encodeAddMemberWithFastPathProposal(params);
    const { votingMode, calls } = decodeProposal(decodeEnter(result.calldata).data);

    expect(votingMode).toBe(0);
    expect(calls.map(c => c.functionName)).toEqual(['addMember', 'unrestrictSpace']);
    expect(result.proposalId).toMatch(/^0x[0-9a-f]{32}$/);
  });

  it('restricts someone directly, without a proposal', () => {
    const result = encodeRestrictMemberFastPath(params);
    const enter = decodeEnter(result.calldata);
    const [target] = decodeAbiParameters([{ type: 'bytes16' }], enter.data);

    expect(enter.action).toBe(GOVERNANCE_ACTIONS.SPACE_FAST_PATH_RESTRICTED);
    expect(enter.topic).toBe(`0x${MEMBER}${'0'.repeat(32)}`);
    expect(target).toBe(`0x${MEMBER}`);
    expect('proposalId' in result).toBe(false);
  });

  // The envelope has to match what the SDK builds for its own role proposals, or the indexer and the
  // contract would read ours differently.
  it('builds the same proposal envelope as the SDK role helpers', () => {
    const ours = encodeUnrestrictMemberProposal(params);
    const sdk = geo.daoSpaces.proposeAddMember({
      authorSpaceId: AUTHOR,
      spaceId: DAO,
      newMemberSpaceId: MEMBER,
      proposalId: ours.proposalId,
      votingMode: 'SLOW',
    });
    const sdkEnter = decodeEnter(sdk.calldata);
    const ourEnter = decodeEnter(ours.calldata);

    expect(ourEnter.action).toBe(sdkEnter.action);
    expect(ourEnter.topic).toBe(sdkEnter.topic);
    expect(decodeProposal(ourEnter.data).calls[0]?.toSpaceId).toBe(decodeProposal(sdkEnter.data).calls[0]?.toSpaceId);
  });

  it('accepts dashed ids and rejects malformed ones', () => {
    const dashed = '22222222-2222-2222-2222-222222222222';
    const [target] = decodeAbiParameters(
      [{ type: 'bytes16' }],
      decodeEnter(encodeRestrictMemberFastPath({ ...params, memberSpaceId: dashed }).calldata).data
    );
    expect(target).toBe(`0x${MEMBER}`);
    expect(() => encodeRestrictMemberFastPath({ ...params, memberSpaceId: '0x12' })).toThrow(
      'memberSpaceId must be a 32-character hex space id'
    );
  });
});
