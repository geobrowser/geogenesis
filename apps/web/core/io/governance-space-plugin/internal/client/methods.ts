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

import { mainVotingPluginAbi, memberAccessPluginAbi, spacePluginAbi, spacePluginSetupAbi } from '../../abis';
import { GeoPluginContext } from '../../context';

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

export class GeoPluginClientMethods extends ClientCore {
  private geoSpacePluginAddress: string;
  private geoMemberAccessPluginAddress: string;
  private geoMainVotingPluginAddress: string;

  private geoSpacePluginRepoAddress: string;
  private geoMemberAccessPluginRepoAddress: string;
  private geoMainVotingPluginRepoAddress: string;

  // @TODO type these properly -- https://github.com/wagmi-dev/viem/discussions/544
  // private geoSpacePluginContract: any;
  // private geoMainVotingPluginContract: any;
  // private geoMemberAccessPluginContract: any;

  constructor(pluginContext: GeoPluginContext) {
    super(pluginContext);

    // Plugin Addresses
    this.geoSpacePluginAddress = pluginContext.geoSpacePluginAddress;
    this.geoMemberAccessPluginAddress = pluginContext.geoMemberAccessPluginAddress;
    this.geoMainVotingPluginAddress = pluginContext.geoMainVotingPluginAddress;

    // Plugin Repo Addresses
    this.geoSpacePluginRepoAddress = pluginContext.geoSpacePluginRepoAddress;
    this.geoMemberAccessPluginRepoAddress = pluginContext.geoMemberAccessPluginRepoAddress;
    this.geoMainVotingPluginRepoAddress = pluginContext.geoMainVotingPluginRepoAddress;

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

  // Member Access Plugin: Reads
  public async isMember(address: `0x${string}`): Promise<boolean> {
    const isMemberRead = await publicClient.readContract({
      address: this.geoMemberAccessPluginAddress as `0x${string}`,
      abi: memberAccessPluginAbi,
      functionName: 'isMember',
      args: [address],
    });
    return isMemberRead;
  }

  public async isEditor(address: `0x${string}`): Promise<boolean> {
    const isEditorRead = await publicClient.readContract({
      address: this.geoMemberAccessPluginAddress as `0x${string}`,
      abi: memberAccessPluginAbi,
      functionName: 'isEditor',
      args: [address],
    });
    return isEditorRead;
  }

  public async canApprove(proposalId: bigint, address: `0x${string}`): Promise<boolean> {
    const canApproveRead = await publicClient.readContract({
      address: this.geoMemberAccessPluginAddress as `0x${string}`,
      abi: memberAccessPluginAbi,
      functionName: 'canApprove',
      args: [proposalId, address],
    });
    return canApproveRead;
  }

  public async canExecute(proposalId: bigint): Promise<boolean> {
    const canApproveRead = await publicClient.readContract({
      address: this.geoMemberAccessPluginAddress as `0x${string}`,
      abi: memberAccessPluginAbi,
      functionName: 'canExecute',
      args: [proposalId],
    });
    return canApproveRead;
  }

  // public async getProposal(
  //   proposalId: bigint
  // ): Promise<
  //   [
  //     boolean,
  //     number,
  //     { minApprovals: number; snapshotBlock: bigint; startDate: bigint; endDate: bigint },
  //     { to: `0x${string}`; value: bigint; data: `0x${string}` }[],
  //     bigint,
  //   ]
  // > {
  //   const getProposalRead = await publicClient.readContract({
  //     address: this.geoMemberAccessPluginAddress as `0x${string}`,
  //     abi: memberAccessPluginAbi,
  //     functionName: 'getProposal',
  //     args: [proposalId],
  //   });
  //   return getProposalRead;
  // }

  public async hasApproved(proposalId: bigint, address: `0x${string}`): Promise<boolean> {
    const hasApprovedRead = await publicClient.readContract({
      address: this.geoMemberAccessPluginAddress as `0x${string}`,
      abi: memberAccessPluginAbi,
      functionName: 'hasApproved',
      args: [proposalId, address],
    });
    return hasApprovedRead;
  }

  public async supportsInterface(interfaceId: `0x${string}`): Promise<boolean> {
    const supportsInterfaceRead = await publicClient.readContract({
      address: this.geoMemberAccessPluginAddress as `0x${string}`,
      abi: memberAccessPluginAbi,
      functionName: 'supportsInterface',
      args: [interfaceId],
    });
    return supportsInterfaceRead;
  }

  /* function supportsInterface(bytes4 _interfaceId) returns (bool)
function getProposal(uint256 _proposalId) returns (bool executed, uint16 approvals, ProposalParameters parameters, IDAO.Action[] actions, uint256 failsafeActionMap)

*/
  // writes
}
