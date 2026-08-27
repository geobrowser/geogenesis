import { decodeAbiParameters, decodeFunctionData } from 'viem';
import { describe, expect, it } from 'vitest';

import { DAOSpaceAbi, GOVERNANCE_ACTIONS, SpaceRegistryAbi, VOTING_MODE } from './space-registry';
import { buildDaoTopicDeclaredCalldata, buildPersonalTopicDeclaredCalldata } from './space-topic';

const AUTHOR_SPACE_ID = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const TARGET_SPACE_ID = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const TOPIC_ID = 'cccccccccccccccccccccccccccccccc';

describe('buildPersonalTopicDeclaredCalldata', () => {
  it('encodes a direct TOPIC_DECLARED call through SpaceRegistry.enter', () => {
    const calldata = buildPersonalTopicDeclaredCalldata({
      authorSpaceId: AUTHOR_SPACE_ID,
      spaceId: TARGET_SPACE_ID,
      topicId: TOPIC_ID,
    });

    const decoded = decodeFunctionData({
      abi: SpaceRegistryAbi,
      data: calldata,
    });

    expect(decoded.functionName).toBe('enter');
    expect(decoded.args?.[0]).toBe(`0x${AUTHOR_SPACE_ID}`);
    expect(decoded.args?.[1]).toBe(`0x${TARGET_SPACE_ID}`);
    expect(decoded.args?.[2]).toBe(GOVERNANCE_ACTIONS.TOPIC_DECLARED);
    expect(decoded.args?.[3]).toBe(`0x${TOPIC_ID}${'0'.repeat(32)}`);
    expect(decoded.args?.[4]).toBe('0x');
    expect(decoded.args?.[5]).toBe('0x');
  });
});

describe('buildDaoTopicDeclaredCalldata', () => {
  it('encodes a proposal-created call whose action is DAOSpace.ping(TOPIC_DECLARED, ...)', () => {
    const calldata = buildDaoTopicDeclaredCalldata({
      authorSpaceId: AUTHOR_SPACE_ID,
      spaceId: TARGET_SPACE_ID,
      spaceAddress: '0x1111111111111111111111111111111111111111',
      topicId: TOPIC_ID,
    });

    const decoded = decodeFunctionData({
      abi: SpaceRegistryAbi,
      data: calldata,
    });

    expect(decoded.functionName).toBe('enter');
    expect(decoded.args?.[0]).toBe(`0x${AUTHOR_SPACE_ID}`);
    expect(decoded.args?.[1]).toBe(`0x${TARGET_SPACE_ID}`);
    expect(decoded.args?.[2]).toBe(GOVERNANCE_ACTIONS.PROPOSAL_CREATED);

    // Four fields, matching the deployed contracts and the SDK's encodeCreateProposal.
    // This assertion previously described a 3-field tuple and stayed green while every
    // DAO topic write reverted on-chain, so treat the layout here as load-bearing.
    const [proposalId, votingMode, actions] = decodeAbiParameters(
      [
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
      ],
      decoded.args?.[4] as `0x${string}`
    );

    expect(proposalId).toMatch(/^0x[a-f0-9]{32}$/);
    expect(votingMode).toBe(VOTING_MODE.SLOW);
    expect(actions).toHaveLength(1);
    expect(actions[0].toAddress).toBe('0x1111111111111111111111111111111111111111');
    // Targets the DAO by address, so the space-id target is zero.
    expect(actions[0].toSpaceId).toBe(`0x${'0'.repeat(32)}`);
    expect(actions[0].value).toBe(0n);

    const decodedPing = decodeFunctionData({
      abi: DAOSpaceAbi,
      data: actions[0].data,
    });

    expect(decodedPing.functionName).toBe('ping');
    expect(decodedPing.args?.[0]).toBe(GOVERNANCE_ACTIONS.TOPIC_DECLARED);
    expect(decodedPing.args?.[1]).toBe(`0x${TOPIC_ID}${'0'.repeat(32)}`);
    expect(decodedPing.args?.[2]).toBe('0x');
  });
});
