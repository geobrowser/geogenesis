import { votingSettingsToContract } from '@aragon/sdk-client';
import {
  ClientCore,
  PrepareInstallationParams,
  PrepareInstallationStepValue,
  prepareGenericInstallation,
} from '@aragon/sdk-client-common';
import { Effect } from 'effect';
import { bigint } from 'effect/Equivalence';
import { createPublicClient, createWalletClient, getContract, http } from 'viem';
import { goerli, polygonMumbai } from 'viem/chains';

import { WalletClient } from 'wagmi';
import { prepareWriteContract, readContract, waitForTransaction, writeContract } from 'wagmi/actions';

import { memberAccessPluginAbi } from '~/core/io/governance-space-plugin/abis';

import { personalSpaceAdminPluginAbi, personalSpaceAdminPluginSetupAbi } from '../../abis';
import { GeoPersonalSpacePluginContext } from '../../context';

// import * as SPACE_PLUGIN_BUILD_METADATA from '../../metadata/space-build-metadata.json';

// @TODO: use our existing public client and wallet client
export const publicClient = createPublicClient({
  chain: polygonMumbai,
  transport: http(),
});

// const [account] = await window.ethereum.request({ method: 'eth_requestAccounts' });

// const walletClient = createWalletClient({
//   account,
//   chain: polygonMumbai,
//   transport: http(),
// });

export class GeoPersonalSpacePluginClientMethods extends ClientCore {
  private geoPersonalSpaceAdminPluginAddress: string;

  private geoPersonalSpaceAdminPluginRepoAddress: string;

  constructor(pluginContext: GeoPersonalSpacePluginContext) {
    super(pluginContext);

    // Plugin Addresses
    this.geoPersonalSpaceAdminPluginAddress = pluginContext.geoPersonalSpaceAdminPluginAddress;

    // Plugin Repo Addresses
    this.geoPersonalSpaceAdminPluginRepoAddress = pluginContext.geoPersonalSpaceAdminPluginRepoAddress;

    // Contract Instances
    // Note: it would be less verbose to use these, but until we have a way to type them properl we lose viem's type inference
    // const geoSpacePluginContract = getContract({
    //   address: this.geoSpacePluginAddress as `0x${string}`,
    //   abi: spacePluginAbi,
    //   publicClient,
    // });

    // const geoMainVotingPluginContract = getContract({
    //   address: this.geoMainVotingPluginAddress as `0x${string}`,
    //   abi: mainVotingPluginAbi,
    //   publicClient,
    // });

    // const geoMemberAccessPluginContract = getContract({
    //   address: this.geoMemberAccessPluginAddress as `0x${string}`,
    //   abi: memberAccessPluginAbi,
    //   publicClient,
    // });
  }

  // implementation of the methods in the interface

  // public async *prepareSpacePluginInstallation(): AsyncGenerator<PrepareInstallationStepValue> {
  //   yield* prepareGenericInstallation(this.web3, {
  //     daoAddressOrEns: params.daoAddressOrEns,
  //     pluginRepo: this.geoMainVotingPluginRepoAddress,
  //     version: params.version,
  //     installationAbi: SPACE_PLUGIN_BUILD_METADATA?.pluginSetup?.prepareInstallation?.inputs,
  //     pluginSetupProcessorAddress: this.web3.getAddress('pluginSetupProcessorAddress'),
  //   });
  // }

  // Personal Space Admin Plugin: Reads
  public async isMember(address: `0x${string}`): Promise<boolean> {
    const isMemberRead = await publicClient.readContract({
      address: this.geoPersonalSpacePluginAddress as `0x${string}`,
      abi: memberAccessPluginAbi,
      functionName: 'isMember',
      args: [address],
    });
    return isMemberRead;
  }
}
