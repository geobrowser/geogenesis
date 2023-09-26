import { createPublicClient, http } from 'viem';
import { goerli } from 'viem/chains';

import { MEMBER_ACCESS_PLUGIN_ADDRESS, MEMBER_ACCESS_PLUGIN_SETUP_ADDRESS, } from '~/core/constants';

import { mainVotingPluginAbi, memberAccessPluginAbi, spacePluginAbi, spacePluginSetupAbi } from '../../abis';

// @TODO: use our existing public client
export const publicClient = createPublicClient({
  chain: goerli,
  transport: http(),
});

/* space plugin setup */

/* space plugin */

// reads

// writes

/* member access plugin setup */

const memberAccessPluginSetupAddress = MEMBER_ACCESS_PLUGIN_SETUP_ADDRESS;

/*member access plugin */
const memberAccessPluginAddress = MEMBER_ACCESS_PLUGIN_ADDRESS;

// reads
export async function getMemberAccessProposal(proposalId: bigint) {
  const data = await publicClient.readContract({
    address: memberAccessPluginAddress,
    abi: memberAccessPluginAbi,
    functionName: 'getProposal',
    args: [proposalId],
  });
  return data;
}

// writes

/* main voting plugin setup  */

/* main voting plugin */

// reads

export async function getMemberAccessProposal(proposalId: bigint) {
  const data = await publicClient.readContract({
    address: memberAccessPluginAddress,
    abi: mainVotingPluginAbi,
    functionName: 'getProposal',
    args: [proposalId],
  });
  return data;
}

