import { type Hex, encodeAbiParameters, encodeFunctionData } from 'viem';

import { normalizeSpaceId } from '~/core/access/space-access';

import { encodeProposalCreatedData } from './governance';
import {
  DAOSpaceAbi,
  EMPTY_SIGNATURE,
  EMPTY_TOPIC_HEX,
  GOVERNANCE_ACTIONS,
  SPACE_REGISTRY_ADDRESS,
  SpaceRegistryAbi,
  VOTING_MODE,
} from './space-registry';

export type DaoPublishVotingMode = 'FAST' | 'SLOW';

export type DaoPublishEditProposalCalldataArgs = {
  authorSpaceId: string;
  daoSpaceId: string;
  daoSpaceAddress: Hex;
  proposalId: string;
  cid: string;
  votingMode: DaoPublishVotingMode;
};

export function buildDaoPublishEditProposalCalldata({
  authorSpaceId,
  daoSpaceId,
  daoSpaceAddress,
  proposalId,
  cid,
  votingMode,
}: DaoPublishEditProposalCalldataArgs): { to: Hex; calldata: Hex } {
  const normalizedAuthorSpaceId = normalizeSpaceId(authorSpaceId);
  const normalizedDaoSpaceId = normalizeSpaceId(daoSpaceId);
  const normalizedProposalId = normalizeSpaceId(proposalId);

  const editsContentUri = encodeAbiParameters([{ type: 'string' }], [cid]);
  const publishCalldata = encodeFunctionData({
    functionName: 'publish',
    abi: DAOSpaceAbi,
    args: [EMPTY_TOPIC_HEX, editsContentUri, '0x'],
  });

  const data = encodeProposalCreatedData(
    `0x${normalizedProposalId}`,
    votingMode === 'FAST' ? VOTING_MODE.FAST : VOTING_MODE.SLOW,
    [
      {
        to: daoSpaceAddress,
        value: 0n,
        data: publishCalldata,
      },
    ]
  );

  const calldata = encodeFunctionData({
    functionName: 'enter',
    abi: SpaceRegistryAbi,
    args: [
      `0x${normalizedAuthorSpaceId}`,
      `0x${normalizedDaoSpaceId}`,
      GOVERNANCE_ACTIONS.PROPOSAL_CREATED,
      EMPTY_TOPIC_HEX,
      data,
      EMPTY_SIGNATURE,
    ],
  });

  return {
    to: SPACE_REGISTRY_ADDRESS,
    calldata,
  };
}
