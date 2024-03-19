import { encodeFunctionData, stringToHex } from 'viem'
import { SpaceAbi } from '../abis'
import { VoteOption } from '../..'

export function getAcceptSubspaceArguments({
  spacePluginAddress,
  ipfsUri,
  subspaceToAccept,
}: {
  spacePluginAddress: `0x${string}`
  ipfsUri: `ipfs://${string}`
  subspaceToAccept: `0x${string}`
}) {
  return [
    stringToHex(ipfsUri),
    [
      {
        to: spacePluginAddress,
        value: BigInt(0),
        data: encodeFunctionData({
          abi: SpaceAbi,
          functionName: 'acceptSubspace',
          args: [subspaceToAccept],
        }),
      },
    ],
    BigInt(0),
    VoteOption.Yes,
    true,
  ] as const
}
