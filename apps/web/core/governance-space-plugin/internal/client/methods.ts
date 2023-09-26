import { createPublicClient, http } from 'viem';
import { goerli } from 'viem/chains';

import { MEMBER_ACCESS_PLUGIN_ADDRESS, MEMBER_ACCESS_PLUGIN_SETUP_ADDRESS } from '~/core/constants';

import { memberAccessPluginAbi } from '../../abis';

// todo: use our existing public client
export const publicClient = createPublicClient({
  chain: goerli,
  transport: http(),
});

// member access plugin setup

const memberAccessPluginSetupAddress = MEMBER_ACCESS_PLUGIN_SETUP_ADDRESS;

// member access plugin
const memberAccessPluginAddress = MEMBER_ACCESS_PLUGIN_ADDRESS;

export const getMemberAccessProposal = publicClient.readContract({
  address: memberAccessPluginSetupAddress,
  abi: memberAccessPluginAbi,
  functionName: 'getProposal',
});
