import { encodeFunctionData, stringToHex } from 'viem'
import { SpaceAbi } from '../abis'
import { VoteOption } from '../..'

export function getProcessGeoProposalArguments(
  spacePluginAddress: `0x${string}`,
  ipfsUri: `ipfs://${string}`
) {
  return [
    stringToHex(ipfsUri),
    [
      {
        to: spacePluginAddress,
        value: BigInt(0),
        data: encodeFunctionData({
          abi: SpaceAbi,
          functionName: 'processGeoProposal',
          args: [0, 0, ipfsUri],
        }),
      },
    ],
    BigInt(0),
    BigInt(0),
    BigInt(0),
    VoteOption.Yes,
    true,
  ] as const
}
