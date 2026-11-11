import { IdUtils } from '@geoprotocol/geo-sdk';

import { type Hex, encodeAbiParameters, encodeFunctionData } from 'viem';

import { validateSpaceId } from '~/core/io/rest/validation';
import { SPACE_REGISTRY_ADDRESS_HEX } from '~/core/sdk/geo-network';

import { ZERO_ADDRESS, encodeProposalCreatedData, padBytes16ToBytes32 } from './governance';
import { DAOSpaceAbi, EMPTY_SIGNATURE, GOVERNANCE_ACTIONS, SpaceRegistryAbi, VOTING_MODE } from './space-registry';

/**
 * Calldata for changing one person's fast-path access in a DAO space.
 *
 * Stopgap for `geo.daoSpaces.proposeUnrestrictMember`, `proposeAddMemberWithFastPath` and
 * `restrictMemberFastPath` (geo-sdk#112): switch to those once that SDK release lands, and
 * delete this file. The encodings are byte-identical.
 *
 * How the DAO contract treats the restriction:
 * - Restricting is immediate: an editor calls `SpaceRegistry.enter` with
 *   `GOVERNANCE.SPACE_FAST_PATH_RESTRICTED`. No proposal.
 * - Lifting needs a SLOW proposal: `unrestrictSpace` is DAO-only and not a fast-path action.
 * - Leaving keeps the restriction, and a restricted space can't request membership. The way back
 *   in is one SLOW proposal running `addMember` and then `unrestrictSpace`, in that order, because
 *   `addMember` re-applies the restriction when the space restricts new members.
 */

type FastPathParams = { authorSpaceId: string; spaceId: string; memberSpaceId: string };
type DaoRoleFunction = 'addMember' | 'unrestrictSpace';

function bytes16(value: string, name: string): Hex {
  const normalized = validateSpaceId(value.replace(/^0x/, ''));
  if (!normalized) throw new Error(`${name} must be a 32-character hex space id. Received: ${value}`);
  return `0x${normalized}`;
}

function slowRoleProposal({ authorSpaceId, spaceId, memberSpaceId }: FastPathParams, fns: DaoRoleFunction[]) {
  const from = bytes16(authorSpaceId, 'authorSpaceId');
  const dao = bytes16(spaceId, 'spaceId');
  const member = bytes16(memberSpaceId, 'memberSpaceId');
  const proposalId = bytes16(IdUtils.generate(), 'proposalId');

  const data = encodeProposalCreatedData(
    proposalId,
    VOTING_MODE.SLOW,
    fns.map(functionName => ({
      toAddress: ZERO_ADDRESS,
      toSpaceId: dao,
      value: 0n,
      data: encodeFunctionData({ abi: DAOSpaceAbi, functionName, args: [member] }),
    }))
  );

  const calldata = encodeFunctionData({
    abi: SpaceRegistryAbi,
    functionName: 'enter',
    args: [from, dao, GOVERNANCE_ACTIONS.PROPOSAL_CREATED, padBytes16ToBytes32(proposalId), data, EMPTY_SIGNATURE],
  });

  return { to: SPACE_REGISTRY_ADDRESS_HEX, calldata, proposalId };
}

/** SLOW proposal that lifts one person's fast-path restriction. */
export function encodeUnrestrictMemberProposal(params: FastPathParams) {
  return slowRoleProposal(params, ['unrestrictSpace']);
}

/**
 * SLOW proposal that adds someone and then lifts their restriction. Only valid for someone who isn't
 * a member or editor and will hold the restriction once added; otherwise it fails to execute.
 */
export function encodeAddMemberWithFastPathProposal(params: FastPathParams) {
  return slowRoleProposal(params, ['addMember', 'unrestrictSpace']);
}

/** Immediate editor action that puts one person on the review path only. */
export function encodeRestrictMemberFastPath({ authorSpaceId, spaceId, memberSpaceId }: FastPathParams) {
  const member = bytes16(memberSpaceId, 'memberSpaceId');

  const calldata = encodeFunctionData({
    abi: SpaceRegistryAbi,
    functionName: 'enter',
    args: [
      bytes16(authorSpaceId, 'authorSpaceId'),
      bytes16(spaceId, 'spaceId'),
      GOVERNANCE_ACTIONS.SPACE_FAST_PATH_RESTRICTED,
      padBytes16ToBytes32(member),
      encodeAbiParameters([{ type: 'bytes16' }], [member]),
      EMPTY_SIGNATURE,
    ],
  });

  return { to: SPACE_REGISTRY_ADDRESS_HEX, calldata };
}
