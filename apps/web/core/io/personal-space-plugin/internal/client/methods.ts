import { ClientCore } from '@aragon/sdk-client-common';
import { Effect } from 'effect';
import { createPublicClient, http } from 'viem';
import { polygonMumbai } from 'viem/chains';

import { prepareWriteContract, readContract, waitForTransaction, writeContract } from 'wagmi/actions';

import { memberAccessPluginAbi } from '~/core/io/governance-space-plugin/abis';
import {
  TransactionPrepareFailedError,
  TransactionRevertedError,
  TransactionWriteFailedError,
  WaitForTransactionBlockError,
} from '~/core/io/publish';

import { personalSpaceAdminPluginAbi, personalSpaceAdminPluginSetupAbi } from '../../abis';
import { GeoPersonalSpacePluginContext } from '../../context';

// import * as SPACE_PLUGIN_BUILD_METADATA from '../../metadata/space-build-metadata.json';

// @TODO: use our existing public client and wallet client
export const publicClient = createPublicClient({
  chain: polygonMumbai,
  transport: http(),
});

export class GeoPersonalSpacePluginClientMethods extends ClientCore {
  private geoPersonalSpaceAdminPluginAddress: string;

  private geoPersonalSpaceAdminPluginRepoAddress: string;

  constructor(pluginContext: GeoPersonalSpacePluginContext) {
    super(pluginContext);

    // Plugin Address
    this.geoPersonalSpaceAdminPluginAddress = pluginContext.geoPersonalSpaceAdminPluginAddress;

    // Plugin Repo Address
    this.geoPersonalSpaceAdminPluginRepoAddress = pluginContext.geoPersonalSpaceAdminPluginRepoAddress;
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

  // Personal Space Admin Plugin: Write Functions

  // Initialize Personal Space Admin Plugin for an already existing DAO
  public async initializePersonalSpaceAdminPlugin(daoAddress: `0x${string}`) {
    const prepareInitEffect = Effect.tryPromise({
      try: () =>
        prepareWriteContract({
          address: this.geoPersonalSpaceAdminPluginAddress as `0x${string}`,
          abi: personalSpaceAdminPluginAbi,
          functionName: 'initialize',
          args: [daoAddress],
        }),
      catch: error => new TransactionPrepareFailedError(`Transaction prepare failed: ${error}`),
    });

    const writeInitEffect = Effect.gen(function* (awaited) {
      const contractConfig = yield* awaited(prepareInitEffect);

      onInitStateChange('initializing-plugin');

      return yield* awaited(
        Effect.tryPromise({
          try: () => writeContract(contractConfig),
          catch: error => new TransactionWriteFailedError(`Initialization failed: ${error}`),
        })
      );
    });

    const initializePluginProgram = Effect.gen(function* (awaited) {
      const writeInitResult = yield* awaited(writeInitEffect);

      console.log('Transaction hash: ', writeInitResult.hash);
      onInitStateChange('waiting-for-transaction');

      const waitForTransactionEffect = yield* awaited(
        Effect.tryPromise({
          try: () =>
            waitForTransaction({
              hash: writeInitResult.hash,
            }),
          catch: error => new WaitForTransactionBlockError(`Error while waiting for transaction block: ${error}`),
        })
      );

      if (waitForTransactionEffect.status !== 'success') {
        return yield* awaited(
          Effect.fail(
            new TransactionRevertedError(`Transaction reverted: 
        hash: ${waitForTransactionEffect.transactionHash}
        status: ${waitForTransactionEffect.status}
        blockNumber: ${waitForTransactionEffect.blockNumber}
        blockHash: ${waitForTransactionEffect.blockHash}
        ${JSON.stringify(waitForTransactionEffect)}
        `)
          )
        );
      }

      console.log(`Transaction successful. Receipt: 
      hash: ${waitForTransactionEffect.transactionHash}
      status: ${waitForTransactionEffect.status}
      blockNumber: ${waitForTransactionEffect.blockNumber}
      blockHash: ${waitForTransactionEffect.blockHash}
      `);
    });

    await Effect.runPromise(initializePluginProgram);
  }

  // Execute Personal Space Admin Plugin Proposals
  public async executeProposal(
    metadata: `0x${string}`,
    actions: readonly { to: `0x${string}`; value: bigint; data: `0x${string}` }[],
    allowFailureMap: bigint
  ) {
    const prepareExecutionEffect = Effect.tryPromise({
      try: () =>
        prepareWriteContract({
          address: this.geoPersonalSpaceAdminPluginAddress as `0x${string}`,
          abi: personalSpaceAdminPluginAbi,
          functionName: 'executeProposal',
          args: [metadata, actions, allowFailureMap],
        }),
      catch: error => new TransactionPrepareFailedError(`Transaction prepare failed: ${error}`),
    });

    const writeExecutionEffect = Effect.gen(function* (awaited) {
      const contractConfig = yield* awaited(prepareExecutionEffect);

      onProposalStateChange('initializing-proposal');

      return yield* awaited(
        Effect.tryPromise({
          try: () => writeContract(contractConfig),
          catch: error => new TransactionWriteFailedError(`Execution failed: ${error}`),
        })
      );
    });

    const executeProgram = Effect.gen(function* (awaited) {
      const writeExecutionResult = yield* awaited(writeExecutionEffect);

      console.log('Transaction hash: ', writeExecutionResult.hash);
      onProposalStateChange('waiting-for-transaction');

      const waitForTransactionEffect = yield* awaited(
        Effect.tryPromise({
          try: () =>
            waitForTransaction({
              hash: writeExecutionResult.hash,
            }),
          catch: error => new WaitForTransactionBlockError(`Error while waiting for transaction block: ${error}`),
        })
      );

      if (waitForTransactionEffect.status !== 'success') {
        return yield* awaited(
          Effect.fail(
            new TransactionRevertedError(`Transaction reverted: 
        hash: ${waitForTransactionEffect.transactionHash}
        status: ${waitForTransactionEffect.status}
        blockNumber: ${waitForTransactionEffect.blockNumber}
        blockHash: ${waitForTransactionEffect.blockHash}
        ${JSON.stringify(waitForTransactionEffect)}
        `)
          )
        );
      }

      console.log(`Transaction successful. Receipt: 
      hash: ${waitForTransactionEffect.transactionHash}
      status: ${waitForTransactionEffect.status}
      blockNumber: ${waitForTransactionEffect.blockNumber}
      blockHash: ${waitForTransactionEffect.blockHash}
      `);
    });

    await Effect.runPromise(executeProgram);
  }

  // Personal Space Admin Plugin: Read Functions
  public async isEditor(address: `0x${string}`): Promise<boolean> {
    const isEditorRead = await publicClient.readContract({
      address: this.geoPersonalSpaceAdminPluginAddress as `0x${string}`,
      abi: memberAccessPluginAbi,
      functionName: 'isEditor',
      args: [address],
    });
    return isEditorRead;
  }

  public async supportsInterface(interfaceId: `0x${string}`): Promise<boolean> {
    const supportsInterfaceRead = await publicClient.readContract({
      address: this.geoPersonalSpaceAdminPluginAddress as `0x${string}`,
      abi: personalSpaceAdminPluginAbi,
      functionName: 'supportsInterface',
      args: [interfaceId],
    });
    return supportsInterfaceRead;
  }

  // Personal Space Admin Plugin: Inherited Functions
  public async proposalCount(): Promise<bigint> {
    const proposalCountRead = await publicClient.readContract({
      address: this.geoPersonalSpaceAdminPluginAddress as `0x${string}`,
      abi: personalSpaceAdminPluginAbi,
      functionName: 'proposalCount',
    });
    return proposalCountRead;
  }
}
