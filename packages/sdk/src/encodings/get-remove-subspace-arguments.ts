import { encodeFunctionData, stringToHex } from 'viem';

import { SpaceAbi } from '../abis/index.js';
import { VoteOption } from '../types.js';

export function getRemoveSubspaceArguments({
  spacePluginAddress,
  ipfsUri,
  subspaceToAccept,
}: {
  spacePluginAddress: `0x${string}`;
  ipfsUri: `ipfs://${string}`;
  subspaceToAccept: `0x${string}`;
}) {
  return [
    stringToHex(ipfsUri),
    [
      {
        to: spacePluginAddress,
        value: BigInt(0),
        data: encodeFunctionData({
          abi: SpaceAbi,
          functionName: 'removeSubspace',
          args: [subspaceToAccept],
        }),
      },
    ],
    BigInt(0),
    VoteOption.Yes,
    true,
  ] as const;
}
