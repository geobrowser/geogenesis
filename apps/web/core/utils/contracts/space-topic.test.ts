import { describe, expect, it } from 'vitest';

import { decodeAbiParameters, decodeFunctionData } from 'viem';

import { DAOSpaceAbi, GOVERNANCE_ACTIONS, SpaceRegistryAbi, VOTING_MODE } from './space-registry';
import { buildDaoTopicDeclaredCalldata, buildPersonalTopicDeclaredCalldata, encodeInitialTopicId } from './space-topic';

const AUTHOR_SPACE_ID = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const TARGET_SPACE_ID = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const TOPIC_ID = 'cccccccccccccccccccccccccccccccc';

describe('encodeInitialTopicId', () => {
  it('encodes a topic UUID as bytes16 hex with 0x prefix', () => {
    expect(encodeInitialTopicId(TOPIC_ID)).toBe(`0x${TOPIC_ID}`);
  });
});

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

    const [proposalId, votingMode, actions] = decodeAbiParameters(
      [
        { name: 'proposalId', type: 'bytes16' },
        { name: 'votingMode', type: 'uint8' },
        {
          name: 'actions',
          type: 'tuple[]',
          components: [
            { name: 'to', type: 'address' },
            { name: 'value', type: 'uint256' },
            { name: 'data', type: 'bytes' },
          ],
        },
      ],
      decoded.args?.[4] as `0x${string}`
    );

    expect(proposalId).toMatch(/^0x[a-f0-9]{32}$/);
    expect(votingMode).toBe(VOTING_MODE.FAST);
    expect(actions).toHaveLength(1);
    expect(actions[0].to).toBe('0x1111111111111111111111111111111111111111');
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
