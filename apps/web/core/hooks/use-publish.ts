import { Op } from '@geogenesis/sdk';
import { MainVotingAbi, PersonalSpaceAdminAbi } from '@geogenesis/sdk/abis';
import { createEditProposal } from '@geogenesis/sdk/proto';
import { Effect, Either } from 'effect';
import { encodeFunctionData, stringToHex } from 'viem';

import * as React from 'react';

import { TransactionWriteFailedError } from '../errors';
import { IStorageClient, uploadBinary } from '../io/storage/storage';
import { fetchSpace } from '../io/subgraph';
import { Services } from '../services';
import { useStatusBar } from '../state/status-bar-store';
import { GovernanceType, Triple as ITriple, ReviewState } from '../types';
import { Triples } from '../utils/triples';
import { sleepWithCallback } from '../utils/utils';
import { useActionsStore } from './use-actions-store';
import { useSmartAccount } from './use-smart-account';

interface MakeProposalOptions {
  triples: ITriple[];
  spaceId: string;
  name: string;
  onSuccess?: () => void;
  onError?: () => void;
}

export function usePublish() {
  const { storageClient } = Services.useServices();
  const { restore, actions: actionsBySpace } = useActionsStore();
  const smartAccount = useSmartAccount();
  const { dispatch } = useStatusBar();

  /**
   * Take the actions for a specific space the user wants to write to Geo and publish them
   * to IPFS + transact the IPFS hash onto the space's blockchain.
   *
   * After the publish flow finishes update the state of the user's actions for the given
   * space with the published actions being flagged as `hasBeenPublished` and run any additional
   * side effects.
   */
  const make = React.useCallback(
    async ({ triples: triplesToPublish, name, spaceId, onSuccess, onError }: MakeProposalOptions) => {
      if (!smartAccount) return;
      if (triplesToPublish.length < 1) return;

      // @TODO(governance): Pass this to either the makeProposal call or to usePublish.
      // All of our contract calls rely on knowing plugin metadata so this is probably
      // something we need for all of them.
      const space = await fetchSpace({ id: spaceId });

      const publish = Effect.gen(function* () {
        if (!space) {
          return;
        }

        const ops = Triples.prepareTriplesForPublishing(triplesToPublish, spaceId);

        yield* makeProposal({
          name,
          storage: storageClient,
          onChangePublishState: (newState: ReviewState) =>
            dispatch({
              type: 'SET_REVIEW_STATE',
              payload: newState,
            }),
          ops,
          smartAccount,
          space: {
            id: space.id,
            spacePluginAddress: space.spacePluginAddress,
            mainVotingPluginAddress: space.mainVotingPluginAddress,
            personalSpaceAdminPluginAddress: space.personalSpaceAdminPluginAddress,
            type: space.type,
          },
        });

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
      });

      const result = await Effect.runPromise(Effect.either(publish));

      if (Either.isLeft(result)) {
        const error = result.left;
        onError?.();

        if (error instanceof Error) {
          if (error.message.startsWith('Publish failed: UserRejectedRequestError: User rejected the request')) {
            dispatch({ type: 'SET_REVIEW_STATE', payload: 'idle' });
            return;
          }
        }

        dispatch({ type: 'ERROR', payload: error.message });
        return;
      }

      dispatch({ type: 'SET_REVIEW_STATE', payload: 'publish-complete' });

      // want to show the "complete" state for 3s if it succeeds
      await sleepWithCallback(() => {
        dispatch({ type: 'SET_REVIEW_STATE', payload: 'idle' });
        onSuccess?.();
      }, 3000);
    },
    [storageClient, restore, actionsBySpace, smartAccount, dispatch]
  );

  return {
    makeProposal: make,
  };
}

export function useBulkPublish() {
  const { storageClient } = Services.useServices();
  const smartAccount = useSmartAccount();
  const { dispatch } = useStatusBar();

  /**
   * Take the bulk actions for a specific space the user wants to write to Geo and publish them
   * to IPFS + transact the IPFS hash onto Polygon.
   */
  const makeBulkProposal = React.useCallback(
    async ({ triples, name, spaceId, onSuccess, onError }: MakeProposalOptions) => {
      if (triples.length < 1) return;
      if (!smartAccount) return;

      // @TODO(governance): Pass this to either the makeProposal call or to usePublish.
      // All of our contract calls rely on knowing plugin metadata so this is probably
      // something we need for all of them.
      const space = await fetchSpace({ id: spaceId });

      const publish = Effect.gen(function* () {
        if (!space || !space.mainVotingPluginAddress) {
          return;
        }

        yield* makeProposal({
          name,
          storage: storageClient,
          onChangePublishState: (newState: ReviewState) =>
            dispatch({
              type: 'SET_REVIEW_STATE',
              payload: newState,
            }),
          ops: Triples.prepareTriplesForPublishing(triples, spaceId),
          smartAccount,
          space: {
            id: space.id,
            spacePluginAddress: space.spacePluginAddress,
            mainVotingPluginAddress: space.mainVotingPluginAddress,
            personalSpaceAdminPluginAddress: space.personalSpaceAdminPluginAddress,
            type: space.type,
          },
        });
      });

      const result = await Effect.runPromise(Effect.either(publish));

      if (Either.isLeft(result)) {
        const error = result.left;
        onError?.();

        if (error instanceof Error) {
          if (error.message.startsWith('Publish failed: UserRejectedRequestError: User rejected the request')) {
            dispatch({ type: 'SET_REVIEW_STATE', payload: 'idle' });
            return;
          }
        }

        dispatch({ type: 'ERROR', payload: error.message });
        return;
      }

      dispatch({ type: 'SET_REVIEW_STATE', payload: 'publish-complete' });
      onSuccess?.();

      // want to show the "complete" state for 3s if it succeeds
      await sleepWithCallback(() => dispatch({ type: 'SET_REVIEW_STATE', payload: 'idle' }), 3000);
    },
    [storageClient, smartAccount, dispatch]
  );

  return {
    makeBulkProposal,
  };
}

interface MakeProposalArgs {
  name: string;
  ops: Op[];
  storage: IStorageClient;
  smartAccount: NonNullable<ReturnType<typeof useSmartAccount>>;
  space: {
    id: string;
    spacePluginAddress: string;
    mainVotingPluginAddress: string | null;
    personalSpaceAdminPluginAddress: string | null;
    type: GovernanceType;
  };
  onChangePublishState: (newState: ReviewState) => void;
}

// @TODO: depending on the type of space we need to call different functions
// If it's a public space we call proposeEdits, if it's a personal space we
// call submitEdits
function makeProposal(args: MakeProposalArgs) {
  const { name, ops, smartAccount, space, storage, onChangePublishState } = args;

  const proposal = createEditProposal({ name, ops, author: smartAccount.account.address });
  console.log('space type', space.type);

  const writeTxEffect = Effect.gen(function* () {
    if (space.type === 'PUBLIC' && !space.mainVotingPluginAddress) {
      console.error('public space does not have main voting plugin address');
      return;
    }

    if (space.type === 'PERSONAL' && !space.personalSpaceAdminPluginAddress) {
      console.error('personal space does not have member access plugin address');
      return;
    }

    onChangePublishState('publishing-ipfs');
    const cid = yield* uploadBinary(proposal, storage);

    const callData = getCalldataForSpaceGovernanceType({
      type: space.type,
      cid,
      spacePluginAddress: space.spacePluginAddress,
    });

    return yield* Effect.tryPromise({
      try: () =>
        smartAccount.sendTransaction({
          to:
            space.type === 'PUBLIC'
              ? (space.mainVotingPluginAddress as `0x${string}`)
              : (space.personalSpaceAdminPluginAddress as `0x${string}`),
          value: 0n,
          data: callData,
        }),
      catch: error => new TransactionWriteFailedError(`Publish failed: ${error}`),
    });
  });

  const publishProgram = Effect.gen(function* () {
    onChangePublishState('publishing-contract');
    const writeTxHash = yield* writeTxEffect;
    console.log('Transaction hash: ', writeTxHash);
    return writeTxHash;
  });

  return publishProgram;
}

type GovernanceTypeCalldataArgs = {
  type: GovernanceType;
  cid: string;
  spacePluginAddress: string;
};

export function getCalldataForSpaceGovernanceType(args: GovernanceTypeCalldataArgs) {
  switch (args.type) {
    case 'PUBLIC':
      return encodeFunctionData({
        functionName: 'proposeEdits',
        abi: MainVotingAbi,
        // @TODO: Function for encoding args
        args: [stringToHex(args.cid), args.cid, args.spacePluginAddress as `0x${string}`],
      });
    case 'PERSONAL':
      return encodeFunctionData({
        functionName: 'submitEdits',
        abi: PersonalSpaceAdminAbi,
        // @TODO: Function for encoding args
        args: [args.cid, args.spacePluginAddress as `0x${string}`],
      });
  }
}
