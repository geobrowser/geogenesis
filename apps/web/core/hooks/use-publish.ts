import { getProcessGeoProposalArguments } from '@geogenesis/sdk';
import { MainVotingAbi } from '@geogenesis/sdk/abis';
import { createEditProposal } from '@geogenesis/sdk/proto';
import {
  ENTRYPOINT_ADDRESS_V07,
  bundlerActions,
  createSmartAccountClient,
  walletClientToSmartAccountSigner,
} from 'permissionless';
import { signerToSafeSmartAccount } from 'permissionless/accounts';
import { pimlicoBundlerActions, pimlicoPaymasterActions } from 'permissionless/actions/pimlico';
import { WalletClient, createClient, createPublicClient, createWalletClient, encodeFunctionData, http } from 'viem';

import * as React from 'react';

import { useConfig, useWalletClient } from 'wagmi';

import { fetchSpace } from '../io/subgraph';
import { Services } from '../services';
import { Triple as ITriple, ReviewState } from '../types';
import { Triples } from '../utils/triples';
import { CONDUIT_TESTNET } from '../wallet/conduit-chain';
import { useActionsStore } from './use-actions-store';

interface MakeProposalOptions {
  triples: ITriple[];
  onChangePublishState: (newState: ReviewState) => void;
  spaceId: string;
  name: string;
}

export function usePublish() {
  const { storageClient } = Services.useServices();
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

      // @TODO(governance): Pass this to either the makeProposal call or to usePublish.
      // All of our contract calls rely on knowing plugin metadata so this is probably
      // something we need for all of them.
      const space = await fetchSpace({ id: spaceId });

      if (!space || !space.mainVotingPluginAddress) {
        return;
      }

      const ops = Triples.prepareTriplesForPublishing(triplesToPublish, spaceId);

      const proposal = createEditProposal({
        name,
        ops,
        author: wallet.account.address,
      });

      onChangePublishState('publishing-ipfs');
      const hash = await storageClient.uploadBinary(proposal);
      const uri = `ipfs://${hash}` as const;
      onChangePublishState('signing-wallet');

      const encodedProposalArgs = getProcessGeoProposalArguments(spaceId as `0x${string}`, uri);

      onChangePublishState('publishing-contract');

      const callData = encodeFunctionData({
        functionName: 'createProposal',
        abi: MainVotingAbi,
        args: encodedProposalArgs,
      });

      console.log('Generated callData:', callData);

      await transactProposalWithAccountAbstraction(wallet, callData, space.mainVotingPluginAddress as `0x${string}`);

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
    [storageClient, wallet, restore, actionsBySpace]
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
    [storageClient, config, publish, wallet?.account.address]
  );

  return {
    makeBulkProposal,
  };
}

// @TODO: Abstract smart client stuff into a hook or something similar that we
// can inject and use in all our of contract-writing code.
async function transactProposalWithAccountAbstraction(
  walletClient: WalletClient,
  callData: `0x${string}`,
  to: `0x${string}`
) {
  const transport = http(process.env.NEXT_PUBLIC_CONDUIT_TESTNET_RPC!);

  const publicClient = createPublicClient({
    transport,
    chain: CONDUIT_TESTNET,
  });

  // @TODO: environment
  const pimlicoUrl = `https://api.pimlico.io/v2/geo-testnet/rpc?apikey=${process.env.NEXT_PUBLIC_PIMLICO_API_KEY}`;

  const signer = walletClientToSmartAccountSigner(walletClient);

  const safeAccount = await signerToSafeSmartAccount(publicClient, {
    signer: signer,
    entryPoint: ENTRYPOINT_ADDRESS_V07,
    safeVersion: '1.4.1',
  });

  console.log('addresses', { safe: safeAccount.address, wallet: walletClient.account?.address });

  const bundlerClient = createClient({
    transport: http(pimlicoUrl),
    chain: CONDUIT_TESTNET,
  })
    .extend(bundlerActions(ENTRYPOINT_ADDRESS_V07))
    .extend(pimlicoBundlerActions(ENTRYPOINT_ADDRESS_V07));

  const paymasterClient = createClient({
    transport: http(pimlicoUrl),
    chain: CONDUIT_TESTNET,
  }).extend(pimlicoPaymasterActions(ENTRYPOINT_ADDRESS_V07));

  const safeClient = createSmartAccountClient({
    chain: CONDUIT_TESTNET,
    account: safeAccount,
    bundlerTransport: http(pimlicoUrl),
    middleware: {
      gasPrice: async () => {
        return (await bundlerClient.getUserOperationGasPrice()).fast;
      },
      sponsorUserOperation: paymasterClient.sponsorUserOperation,
    },
  });

  const txHash = await safeClient.sendTransaction({
    to: to,
    value: 0n,
    data: callData,
  });

  console.log(`UserOperation included: https://explorerl2new-geo-test-zc16z3tcvf.t.conduit.xyz/tx/${txHash}`);
}

async function transactionProposalWithoutAccountAbstraction() {
  // @TODO: We aren't using makeProposal atm
  // await publishService.makeProposal({
  //   account: wallet.account.address,
  //   storageClient,
  //   ops,
  //   name,
  //   onChangePublishState,
  //   space: spaceId,
  //   walletConfig: walletConfig,
  // });
  // const config = await simulateContract(walletConfig, {
  //   // Main voting plugin address for DAO at 0xd9abC01d1AEc200FC394C2717d7E14348dC23792
  //   address: space.mainVotingPluginAddress as `0x${string}`,
  //   abi: MainVotingAbi,
  //   functionName: 'createProposal',
  //   // @TODO: We should abstract the proposal metadata creation and the proposal
  //   // action callback args together somehow since right now you have to sync
  //   // them both and ensure you're using the correct functions for each content
  //   // proposal type.
  //   //
  //   // What can happen is that you create a "CONTENT" proposal but pass a callback
  //   // action that does some other action like "ADD_SUBSPACE" and it will fail since
  //   // the substream won't index a mismatched proposal type and action callback args.
  //   args: encodedProposalArgs,
  // });
  // const writeResult = await writeContract(walletConfig, config.request);
  // console.log('writeResult', writeResult);
}
