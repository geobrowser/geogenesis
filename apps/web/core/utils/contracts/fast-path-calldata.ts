import { DaoSpaceAbi, SpaceRegistryAbi } from '@geoprotocol/geo-sdk/abis';

import { type Hex, encodeAbiParameters, encodeFunctionData, keccak256, toHex } from 'viem';

/**
 * Calldata for changing one person's fast-path access in a DAO space.
 *
 * Mirrors `geo.daoSpaces.proposeUnrestrictMember`, `proposeAddMemberWithFastPath` and
 * `restrictMemberFastPath` from geo-sdk#112. Replace these with the SDK helpers once that
 * ships in a release; the encodings are the same.
 *
 * How the DAO contract treats the restriction:
 * - Restricting is immediate: any editor calls `SpaceRegistry.enter` with
 *   `GOVERNANCE.SPACE_FAST_PATH_RESTRICTED`. No proposal.
 * - Lifting needs a SLOW proposal: `unrestrictSpace` is DAO-only and not a fast-path action.
 * - Leaving a space keeps the restriction, and a restricted space can't request membership.
 *   The way back in is one SLOW proposal running `addMember` and then `unrestrictSpace`, in that
 *   order, because `addMember` re-applies the restriction when the space restricts new members.
 */

const PROPOSAL_CREATED_ACTION = keccak256(toHex('GOVERNANCE.PROPOSAL_CREATED'));
export const SPACE_FAST_PATH_RESTRICTED_ACTION = keccak256(toHex('GOVERNANCE.SPACE_FAST_PATH_RESTRICTED'));

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const SLOW_VOTING_MODE = 0;

type DaoRoleFunction = 'addMember' | 'unrestrictSpace';

export type CalldataResult = { to: Hex; calldata: Hex };
export type ProposalCalldataResult = CalldataResult & { proposalId: Hex };

function toBytes16(value: string, name: string): Hex {
  const hex = (value.startsWith('0x') ? value : `0x${value}`).replace(/-/g, '').toLowerCase();
  if (!/^0x[0-9a-f]{32}$/.test(hex)) {
    throw new Error(`${name} must be a 32-character hex space id. Received: ${value}`);
  }
  return hex as Hex;
}

function toBytes32LeftAligned(bytes16: Hex): Hex {
  return `${bytes16}${'0'.repeat(32)}` as Hex;
}

function newProposalId(): Hex {
  return `0x${crypto.randomUUID().replace(/-/g, '')}` as Hex;
}

function roleAction(daoSpaceId: Hex, functionName: DaoRoleFunction, spaceId: Hex) {
  return {
    toAddress: ZERO_ADDRESS as Hex,
    toSpaceId: daoSpaceId,
    value: 0n,
    data: encodeFunctionData({ abi: DaoSpaceAbi, functionName, args: [spaceId] }),
  };
}

function slowProposal(params: {
  registry: Hex;
  authorSpaceId: string;
  spaceId: string;
  proposalId?: string;
  actions: Array<{ fn: DaoRoleFunction; target: string }>;
}): ProposalCalldataResult {
  const authorSpaceId = toBytes16(params.authorSpaceId, 'authorSpaceId');
  const spaceId = toBytes16(params.spaceId, 'spaceId');
  const proposalId = params.proposalId ? toBytes16(params.proposalId, 'proposalId') : newProposalId();
  const actions = params.actions.map(a => roleAction(spaceId, a.fn, toBytes16(a.target, 'memberSpaceId')));

  const data = encodeAbiParameters(
    [
      { type: 'bytes16', name: 'proposalId' },
      { type: 'uint8', name: 'votingMode' },
      {
        type: 'tuple[]',
        name: 'actions',
        components: [
          { type: 'address', name: 'toAddress' },
          { type: 'bytes16', name: 'toSpaceId' },
          { type: 'uint256', name: 'value' },
          { type: 'bytes', name: 'data' },
        ],
      },
    ],
    [proposalId, SLOW_VOTING_MODE, actions]
  );

  const calldata = encodeFunctionData({
    abi: SpaceRegistryAbi,
    functionName: 'enter',
    args: [authorSpaceId, spaceId, PROPOSAL_CREATED_ACTION, toBytes32LeftAligned(proposalId), data, '0x'],
  });

  return { to: params.registry, calldata, proposalId };
}

/** SLOW proposal that lifts one person's fast-path restriction. */
export function encodeUnrestrictMemberProposal(params: {
  registry: Hex;
  authorSpaceId: string;
  spaceId: string;
  memberSpaceId: string;
  proposalId?: string;
}): ProposalCalldataResult {
  return slowProposal({ ...params, actions: [{ fn: 'unrestrictSpace', target: params.memberSpaceId }] });
}

/**
 * SLOW proposal that adds someone and then lifts their restriction. Only valid when they will hold
 * the restriction once added (the space restricts new members, or they're already restricted);
 * otherwise `unrestrictSpace` reverts and the whole proposal fails to execute.
 */
export function encodeAddMemberWithFastPathProposal(params: {
  registry: Hex;
  authorSpaceId: string;
  spaceId: string;
  memberSpaceId: string;
  proposalId?: string;
}): ProposalCalldataResult {
  return slowProposal({
    ...params,
    actions: [
      { fn: 'addMember', target: params.memberSpaceId },
      { fn: 'unrestrictSpace', target: params.memberSpaceId },
    ],
  });
}

/** Immediate editor action that puts one person on the review path only. */
export function encodeRestrictMemberFastPath(params: {
  registry: Hex;
  authorSpaceId: string;
  spaceId: string;
  memberSpaceId: string;
}): CalldataResult {
  const authorSpaceId = toBytes16(params.authorSpaceId, 'authorSpaceId');
  const spaceId = toBytes16(params.spaceId, 'spaceId');
  const memberSpaceId = toBytes16(params.memberSpaceId, 'memberSpaceId');
  const data = encodeAbiParameters([{ type: 'bytes16', name: 'spaceId' }], [memberSpaceId]);

  const calldata = encodeFunctionData({
    abi: SpaceRegistryAbi,
    functionName: 'enter',
    args: [authorSpaceId, spaceId, SPACE_FAST_PATH_RESTRICTED_ACTION, toBytes32LeftAligned(memberSpaceId), data, '0x'],
  });

  return { to: params.registry, calldata };
}
