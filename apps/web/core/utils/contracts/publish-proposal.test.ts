import { decodeAbiParameters, decodeFunctionData } from 'viem';
import { describe, expect, it } from 'vitest';

import { buildDaoPublishEditProposalCalldata } from './publish-proposal';
import {
  DAOSpaceAbi,
  EMPTY_SIGNATURE,
  EMPTY_TOPIC_HEX,
  GOVERNANCE_ACTIONS,
  SPACE_REGISTRY_ADDRESS,
  SpaceRegistryAbi,
  VOTING_MODE,
} from './space-registry';

describe('buildDaoPublishEditProposalCalldata', () => {
  it('builds a slow publish proposal with normalized ids and the app governance encoding', () => {
    const result = buildDaoPublishEditProposalCalldata({
      authorSpaceId: '68e800d1-d89e-8f0c-3293-82f4c3106d78',
      daoSpaceId: 'C9F267DC-B0D2-7071-8C2A-3C45A64AFD32',
      daoSpaceAddress: '0x40230BBf745b3708688347aDe02d04e52eD82f45',
      proposalId: '11111111-1111-1111-1111-111111111111',
      cid: 'ipfs://example-edit-cid',
      votingMode: 'SLOW',
    });

    expect(result.to).toBe(SPACE_REGISTRY_ADDRESS);

    const decodedEnter = decodeFunctionData({
      abi: SpaceRegistryAbi,
      data: result.calldata,
    });

    expect(decodedEnter.functionName).toBe('enter');
    expect(decodedEnter.args).toEqual([
      '0x68e800d1d89e8f0c329382f4c3106d78',
      '0xc9f267dcb0d270718c2a3c45a64afd32',
      GOVERNANCE_ACTIONS.PROPOSAL_CREATED,
      EMPTY_TOPIC_HEX,
      expect.any(String),
      EMPTY_SIGNATURE,
    ]);

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
      decodedEnter.args[4]
    );

    expect(proposalId).toBe('0x11111111111111111111111111111111');
    expect(votingMode).toBe(VOTING_MODE.SLOW);
    expect(actions).toHaveLength(1);
    expect(actions[0].to).toBe('0x40230BBf745b3708688347aDe02d04e52eD82f45');

    const decodedPublish = decodeFunctionData({
      abi: DAOSpaceAbi,
      data: actions[0].data,
    });

    expect(decodedPublish.functionName).toBe('publish');
    expect(decodedPublish.args[0]).toBe(EMPTY_TOPIC_HEX);
  });

  it('encodes fast voting mode for editors', () => {
    const result = buildDaoPublishEditProposalCalldata({
      authorSpaceId: '68e800d1d89e8f0c329382f4c3106d78',
      daoSpaceId: 'c9f267dcb0d270718c2a3c45a64afd32',
      daoSpaceAddress: '0x40230BBf745b3708688347aDe02d04e52eD82f45',
      proposalId: '11111111111111111111111111111111',
      cid: 'ipfs://example-edit-cid',
      votingMode: 'FAST',
    });

    const decodedEnter = decodeFunctionData({
      abi: SpaceRegistryAbi,
      data: result.calldata,
    });
    const [, votingMode] = decodeAbiParameters(
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
      decodedEnter.args[4]
    );

    expect(votingMode).toBe(VOTING_MODE.FAST);
  });
});
