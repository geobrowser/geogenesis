import { IdUtils } from '@geoprotocol/geo-sdk/lite';

import { type Hex, encodeFunctionData } from 'viem';

import { uuidToHex } from '~/core/id/normalize';

import { encodeProposalCreatedData, padBytes16ToBytes32 } from './governance';
import {
  DAOSpaceAbi,
  EMPTY_SIGNATURE,
  EMPTY_TOPIC_HEX,
  GOVERNANCE_ACTIONS,
  SpaceRegistryAbi,
  VOTING_MODE,
} from './space-registry';

export function encodeInitialTopicId(topicId: string): Hex {
  return `0x${uuidToHex(topicId)}` as Hex;
}

export function buildPersonalTopicDeclaredCalldata({
  authorSpaceId,
  spaceId,
  topicId,
}: {
  authorSpaceId: string;
  spaceId: string;
  topicId: string;
}): Hex {
  const fromSpaceId = `0x${authorSpaceId}` as const;
  const toSpaceId = `0x${spaceId}` as const;
  const topic = padBytes16ToBytes32(uuidToHex(topicId));

  return encodeFunctionData({
    functionName: 'enter',
    abi: SpaceRegistryAbi,
    args: [fromSpaceId, toSpaceId, GOVERNANCE_ACTIONS.TOPIC_DECLARED, topic, '0x', EMPTY_SIGNATURE],
  });
}

export function buildDaoTopicDeclaredCalldata({
  authorSpaceId,
  spaceId,
  spaceAddress,
  topicId,
}: {
  authorSpaceId: string;
  spaceId: string;
  spaceAddress: Hex;
  topicId: string;
}): Hex {
  const proposalId = `0x${IdUtils.generate()}` as const;
  const fromSpaceId = `0x${authorSpaceId}` as const;
  const toSpaceId = `0x${spaceId}` as const;
  const topic = padBytes16ToBytes32(uuidToHex(topicId));

  const pingCallData = encodeFunctionData({
    functionName: 'ping',
    abi: DAOSpaceAbi,
    args: [GOVERNANCE_ACTIONS.TOPIC_DECLARED, topic, '0x'],
  });

  const data = encodeProposalCreatedData(proposalId, VOTING_MODE.FAST, [
    {
      to: spaceAddress,
      value: 0n,
      data: pingCallData,
    },
  ]);

  return encodeFunctionData({
    functionName: 'enter',
    abi: SpaceRegistryAbi,
    args: [fromSpaceId, toSpaceId, GOVERNANCE_ACTIONS.PROPOSAL_CREATED, EMPTY_TOPIC_HEX, data, EMPTY_SIGNATURE],
  });
}
