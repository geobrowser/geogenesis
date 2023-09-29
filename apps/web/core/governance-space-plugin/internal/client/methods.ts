import {
  ClientCore,
  PrepareInstallationParams,
  PrepareInstallationStepValue,
  prepareGenericInstallation,
} from '@aragon/sdk-client-common';
import {GetContractReturnType, createPublicClient, createWalletClient, getContract, http } from 'viem';
import { goerli, polygonMumbai, } from 'viem/chains';
import { Effect } from 'effect';
import { WalletClient } from 'wagmi';
import { prepareWriteContract, readContract, waitForTransaction, writeContract } from 'wagmi/actions';

import { mainVotingPluginAbi, memberAccessPluginAbi, spacePluginAbi, spacePluginSetupAbi } from '../../abis';
import { GeoPluginContext } from '../../context';
import { Contract } from 'viem/dist/types/types/multicall';



// @TODO: use our existing public client and wallet client
export const publicClient = createPublicClient({
  chain: goerli,
  transport: http(),
});

const [account] = await window.ethereum.request({ method: 'eth_requestAccounts' });

const walletClient = createWalletClient({
  account,
  chain: polygonMumbai,
  transport: http(),
});

export class GeoPluginClientMethods extends ClientCore {
  private geoSpacePluginAddress: string;
  private geoMemberAccessPluginAddress: string;
  private geoMainVotingPluginAddress: string;

  private geoSpacePluginRepoAddress: string;
  private geoMemberAccessPluginRepoAddress: string;
  private geoMainVotingPluginRepoAddress: string;

  // @TODO type these properly -- https://github.com/wagmi-dev/viem/discussions/544
  private geoSpacePluginContrac: any;;
  private geoMainVotingPluginContract: any;
  private geoMemberAccessPluginContract: any;

  constructor(pluginContext: GeoPluginContext) {
    super(pluginContext);

    // Plugin addresses
    this.geoSpacePluginAddress = pluginContext.geoSpacePluginAddress;
    this.geoMemberAccessPluginAddress = pluginContext.geoMemberAccessPluginAddress;
    this.geoMainVotingPluginAddress = pluginContext.geoMainVotingPluginAddress;

    // Plugin repo addresses
    this.geoSpacePluginRepoAddress = pluginContext.geoSpacePluginRepoAddress;
    this.geoMemberAccessPluginRepoAddress = pluginContext.geoMemberAccessPluginRepoAddress;
    this.geoMainVotingPluginRepoAddress = pluginContext.geoMainVotingPluginRepoAddress;

    // Contract instances
    const geoSpacePluginContract = getContract({
      address: this.geoSpacePluginAddress as `0x${string}`,
      abi: spacePluginAbi,
      publicClient,
    });

    const geoMainVotingPluginContract = getContract({
      address: this.geoMainVotingPluginAddress as `0x${string}`,
      abi: mainVotingPluginAbi,
      publicClient,
    });

    const geoMemberAccessPluginContract = getContract({
      address: this.geoMemberAccessPluginAddress as `0x${string}`,
      abi: memberAccessPluginAbi,
      publicClient,
    });
  }

// reads

public async isMember(address: `0x${string}`): Promise<boolean> {
  const isMember = await publicClient.readContract({
    address: this.geoMemberAccessPluginAddress as `0x${string}`,
    abi: memberAccessPluginAbi,
    functionName: 'isMember',
    args: [address],
  });
  return isMember;
}




 // writes



  }
}
