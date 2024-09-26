import { encodeFunctionData, stringToHex } from 'viem';
import { MainVotingAbi } from '../abis';
import { VoteOption } from '../../index.js';

export function getRemoveEditorArguments({
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
					functionName: 'removeMember',
					args: [editorAddress],
				}),
			},
		],
		BigInt(0),
		VoteOption.Yes,
		true,
	] as const;
}
