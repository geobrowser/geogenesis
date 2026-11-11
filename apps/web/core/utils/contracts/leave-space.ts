import { type Hex, encodeAbiParameters, encodeFunctionData, keccak256, stringToHex } from 'viem';

import { validateSpaceId } from '~/core/io/rest/validation';

import { EMPTY_SIGNATURE, EMPTY_TOPIC_HEX, SPACE_MEMBER_ROLE, SpaceRegistryAbi } from './space-registry';

/**
 * The SDK has no leave helper yet. DAOSpace.write handles SPACE_LEFT with an
 * ABI-encoded role, and removes that role from the authenticated fromSpaceId.
 * https://github.com/geobrowser/geo-contracts-foundry/blob/dev/src/contracts/DAOSpace.sol
 */
export function encodeLeaveSpaceCall({
  registry,
  personalSpaceId,
  spaceId,
}: {
  registry: Hex;
  personalSpaceId: string;
  spaceId: string;
}) {
  const author = validateSpaceId(personalSpaceId);
  const target = validateSpaceId(spaceId);
  if (!author || !target) throw new Error('Invalid space ID');

  return {
    to: registry,
    data: encodeFunctionData({
      abi: SpaceRegistryAbi,
      functionName: 'enter',
      args: [
        `0x${author}`,
        `0x${target}`,
        keccak256(stringToHex('GOVERNANCE.SPACE_LEFT')),
        EMPTY_TOPIC_HEX,
        // Leave only membership. An editor who is also a member keeps their editor role.
        encodeAbiParameters([{ type: 'bytes32' }], [SPACE_MEMBER_ROLE]),
        EMPTY_SIGNATURE,
      ],
    }),
  };
}
