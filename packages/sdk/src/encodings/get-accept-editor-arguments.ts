import { encodeFunctionData, stringToHex } from 'viem';

import { MainVotingAbi } from '../abis/index.js';
import { VoteOption } from '../types.js';

export function getAcceptEditorArguments({
  votingPluginAddress,
  ipfsUri,
  editorAddress,
}: {
  votingPluginAddress: `0x${string}`;
  ipfsUri: `ipfs://${string}`;
  editorAddress: `0x${string}`;
}) {
  return [
    stringToHex(ipfsUri),
    [
      {
        to: votingPluginAddress,
        value: BigInt(0),
        data: encodeFunctionData({
          abi: MainVotingAbi,
          functionName: 'addEditor',
          args: [editorAddress],
        }),
      },
    ],
    BigInt(0),
    VoteOption.None,
    true,
  ] as const;
}
