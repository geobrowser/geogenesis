import { DaoSpaceAbi, SpaceRegistryAbi } from '@geoprotocol/geo-sdk/abis';

import { decodeAbiParameters, decodeFunctionData } from 'viem';
import { describe, expect, it } from 'vitest';

import { geo } from '~/core/sdk/geo-client';

import {
  SPACE_FAST_PATH_RESTRICTED_ACTION,
  encodeAddMemberWithFastPathProposal,
  encodeRestrictMemberFastPath,
  encodeUnrestrictMemberProposal,
} from './fast-path-calldata';

const REGISTRY = '0x0000000000000000000000000000000000000001';
const AUTHOR = '0eed5491b917cf58b33ac81255fe7ae9';
const DAO = 'abcdef12345678901234567890abcdef';
const MEMBER = '22222222222222222222222222222222';
const PROPOSAL = '11111111111111111111111111111111';

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
    calls: actions.map(a => ({ ...decodeFunctionData({ abi: DaoSpaceAbi, data: a.data }), toSpaceId: a.toSpaceId })),
  };
}

describe('fast-path calldata', () => {
  it('lifts a restriction with a single SLOW unrestrictSpace proposal', () => {
    const result = encodeUnrestrictMemberProposal({
      registry: REGISTRY,
      authorSpaceId: AUTHOR,
      spaceId: DAO,
      memberSpaceId: MEMBER,
      proposalId: PROPOSAL,
    });
    const enter = decodeEnter(result.calldata);
    const { votingMode, calls } = decodeProposal(enter.data);

    expect(result.to).toBe(REGISTRY);
    expect(result.proposalId).toBe(`0x${PROPOSAL}`);
    expect(enter.from).toBe(`0x${AUTHOR}`);
    expect(enter.to).toBe(`0x${DAO}`);
    expect(votingMode).toBe(0);
    expect(calls.map(c => [c.functionName, c.args?.[0], c.toSpaceId])).toEqual([
      ['unrestrictSpace', `0x${MEMBER}`, `0x${DAO}`],
    ]);
  });

  // addMember re-applies the restriction in a space that restricts new members, so it has to run first.
  it('re-adds someone with addMember before unrestrictSpace', () => {
    const result = encodeAddMemberWithFastPathProposal({
      registry: REGISTRY,
      authorSpaceId: AUTHOR,
      spaceId: DAO,
      memberSpaceId: MEMBER,
    });
    const { votingMode, calls } = decodeProposal(decodeEnter(result.calldata).data);

    expect(votingMode).toBe(0);
    expect(calls.map(c => c.functionName)).toEqual(['addMember', 'unrestrictSpace']);
    expect(result.proposalId).toMatch(/^0x[0-9a-f]{32}$/);
  });

  it('restricts someone directly, without a proposal', () => {
    const result = encodeRestrictMemberFastPath({
      registry: REGISTRY,
      authorSpaceId: AUTHOR,
      spaceId: DAO,
      memberSpaceId: MEMBER,
    });
    const enter = decodeEnter(result.calldata);
    const [target] = decodeAbiParameters([{ type: 'bytes16' }], enter.data);

    expect(enter.action).toBe(SPACE_FAST_PATH_RESTRICTED_ACTION);
    expect(enter.topic).toBe(`0x${MEMBER}${'0'.repeat(32)}`);
    expect(target).toBe(`0x${MEMBER}`);
    expect('proposalId' in result).toBe(false);
  });

  // The proposal envelope has to match what the SDK builds for its own role proposals, or the
  // indexer and the contract would read ours differently.
  it('builds the same proposal envelope as the SDK role helpers', () => {
    const sdk = geo.daoSpaces.proposeAddMember({
      authorSpaceId: AUTHOR,
      spaceId: DAO,
      newMemberSpaceId: MEMBER,
      proposalId: PROPOSAL,
      votingMode: 'SLOW',
    });
    const ours = encodeUnrestrictMemberProposal({
      registry: REGISTRY,
      authorSpaceId: AUTHOR,
      spaceId: DAO,
      memberSpaceId: MEMBER,
      proposalId: PROPOSAL,
    });
    const sdkEnter = decodeEnter(sdk.calldata);
    const ourEnter = decodeEnter(ours.calldata);
    const sdkProposal = decodeProposal(sdkEnter.data);
    const ourProposal = decodeProposal(ourEnter.data);

    expect(ourEnter.action).toBe(sdkEnter.action);
    expect(ourEnter.topic).toBe(sdkEnter.topic);
    expect(ourProposal.proposalId).toBe(sdkProposal.proposalId);
    expect(ourProposal.votingMode).toBe(sdkProposal.votingMode);
    expect(ourProposal.calls[0]?.toSpaceId).toBe(sdkProposal.calls[0]?.toSpaceId);
  });

  it('rejects malformed space ids', () => {
    expect(() =>
      encodeRestrictMemberFastPath({ registry: REGISTRY, authorSpaceId: AUTHOR, spaceId: DAO, memberSpaceId: '0x12' })
    ).toThrow('memberSpaceId must be a 32-character hex space id');
  });
});
