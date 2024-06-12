import { MainVotingAbi } from '@geogenesis/sdk/abis';
import { ENTRYPOINT_ADDRESS_V07, createSmartAccountClient, walletClientToSmartAccountSigner } from 'permissionless';
import { signerToSafeSmartAccount } from 'permissionless/accounts';
import { createPimlicoBundlerClient, createPimlicoPaymasterClient } from 'permissionless/clients/pimlico';
import { createPublicClient, createWalletClient, encodeFunctionData, http } from 'viem';
import { polygon } from 'viem/chains';

import * as React from 'react';

import { useConfig, useWalletClient } from 'wagmi';

import { Services } from '../services';
import { Triple as ITriple, ReviewState } from '../types';
import { Action } from '../utils/action';
import { Triples } from '../utils/triples';
import { useActionsStore } from './use-actions-store';

interface MakeProposalOptions {
  triples: ITriple[];
  onChangePublishState: (newState: ReviewState) => void;
  spaceId: string;
  name: string;
}

export function usePublish() {
  const config = useConfig();
  const { storageClient, publish: publishService } = Services.useServices();
  const { restore, actions: actionsBySpace } = useActionsStore();
  const { data: wallet } = useWalletClient();

  /**
   * Take the actions for a specific space the user wants to write to Geo and publish them
   * to IPFS + transact the IPFS hash onto Polygon.
   *
   * After the publish flow finishes update the state of the user's actions for the given
   * space with the published actions being flagged as `hasBeenPublished` and run any additional
   * side effects.
   */
  const makeProposal = React.useCallback(
    async ({ triples: triplesToPublish, name, onChangePublishState, spaceId }: MakeProposalOptions) => {
      if (!wallet) return;
      if (triplesToPublish.length < 1) return;

      const transport = http(process.env.NEXT_PUBLIC_ALCHEMY_ENDPOINT!);
      const v2Transport = http(process.env.NEXT_PUBLIC_PIMLICO_RPC_URL!);
      const v1Transport = http(process.env.NEXT_PUBLIC_BUNDLER_RPC_URL!);

      const walletClient = createWalletClient({
        account: wallet.account,
        chain: polygon,
        transport,
      });

      const publicClient = createPublicClient({
        chain: polygon,
        transport,
      });

      const signer = walletClientToSmartAccountSigner(walletClient);

      // const account = await privateKeyToSafeSmartAccount(publicClient, {
      //   privateKey: '0xe78b3806662d8491f6a68bed650f20eba23e09f9759b4a80336ab63fa2df7aac',
      //   entryPoint: ENTRYPOINT_ADDRESS_V07,
      //   safeVersion: '1.4.1',
      // });

      const account = await signerToSafeSmartAccount(publicClient, {
        signer,
        entryPoint: ENTRYPOINT_ADDRESS_V07,
        safeVersion: '1.4.1',
      });

      /**
       * So for entrypoint v0.6 (we recommend using v0.7 for new projects now) you'd have to use the v1 api for the bundler endpoints (bundlerClient and smartAccountClient) and the v2 api for the paymaster endpoints
       *
       * Apologies for the confusion here, for v0.7 everything uses the v2 api.
       * We do support polygon. Everything should ideally work with the standard Permissionless sdk
       *
       * Let me know if this helps!!
       *
       * Otherwise happy to help continue debugging
       *
       * JSON is not a valid request object.  URL: https://api.pimlico.io/v2/polygon/rpc?apikey=cbd9fab9-2874-4bc9-9dc1-578ee41335dc Request body: {"method":"pimlico_getUserOperationGasPrice","params":[]}  Details: API version v2 is not supported for chain: polygon Version: viem@2.7.12
       */
      const pimlicoPaymaster = createPimlicoPaymasterClient({
        entryPoint: ENTRYPOINT_ADDRESS_V07,
        transport: v2Transport,
      });

      const bundlerClient = createPimlicoBundlerClient({
        entryPoint: ENTRYPOINT_ADDRESS_V07,
        transport: v2Transport,
      });

      const smartAccountClient = createSmartAccountClient({
        account,
        entryPoint: ENTRYPOINT_ADDRESS_V07,
        chain: polygon,
        bundlerTransport: v2Transport,
        middleware: {
          gasPrice: async () => {
            return (await bundlerClient.getUserOperationGasPrice()).fast; // if using pimlico bundlers
          },
          sponsorUserOperation: pimlicoPaymaster.sponsorUserOperation,
        },
      });

      console.log('smart account address', smartAccountClient.account);

      await publishService.makeProposal({
        account: wallet.account.address,
        storageClient,
        ops: Triples.prepareTriplesForPublishing(triplesToPublish, spaceId),
        name,
        onChangePublishState,
        space: spaceId,
        walletConfig: config,
      });

      // const functionData = encodeFunctionData({
      //   functionName: 'createProposal',
      //   abi: MainVotingAbi,
      //   args: [cids],
      // });

      // const txHash = await smartAccountClient.sendTransaction({
      //   to: spaceId as `0x${string}`,
      //   data: functionData,
      //   value: BigInt(0),
      // });

      const triplesBeingPublished = new Set(
        triplesToPublish.map(a => {
          return a.id;
        })
      );

      // We filter out the actions that are being published from the actionsBySpace. We do this
      // since we need to update the entire state of the space with the published actions and the
      // unpublished actions being merged together.
      // If the actionsBySpace[spaceId] is empty, then we return an empty array
      const nonPublishedActions = actionsBySpace[spaceId]
        ? actionsBySpace[spaceId].filter(a => {
            return !triplesBeingPublished.has(a.id);
          })
        : [];

      const publishedActions = triplesToPublish.map(action => ({
        ...action,
        // We keep published actions in memory to keep the UI optimistic. This is mostly done
        // because there is a period between publishing actions and the subgraph finishing indexing
        // where the UI would be in a state where the published actions are not showing up in the UI.
        // Instead we keep the actions in memory so the UI is up-to-date while the subgraph indexes.
        hasBeenPublished: true,
      }));

      // Update the actionsBySpace for the current space to set the published actions
      // as hasBeenPublished and merge with the existing actions in the space.
      restore({
        ...actionsBySpace,
        [spaceId]: [...publishedActions, ...nonPublishedActions],
      });
    },
    [storageClient, wallet, publishService, restore, actionsBySpace]
  );

  return {
    makeProposal,
    // @TODO: This should also include APIs for granting and revoking roles
  };
}

export function useBulkPublish() {
  const { storageClient, publish } = Services.useServices();
  const config = useConfig();
  const { data: wallet } = useWalletClient();

  /**
   * Take the bulk actions for a specific space the user wants to write to Geo and publish them
   * to IPFS + transact the IPFS hash onto Polygon.
   */
  const makeBulkProposal = React.useCallback(
    async ({ triples, name, onChangePublishState, spaceId }: MakeProposalOptions) => {
      if (triples.length < 1) return;
      if (!wallet?.account.address) return;

      await publish.makeProposal({
        account: wallet?.account.address,
        storageClient,
        ops: Triples.prepareTriplesForPublishing(triples, spaceId),
        name,
        onChangePublishState,
        space: spaceId,
        walletConfig: config,
      });
    },
    [storageClient, config, publish]
  );

  return {
    makeBulkProposal,
  };
}
