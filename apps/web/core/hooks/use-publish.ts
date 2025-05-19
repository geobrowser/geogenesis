import { Op } from '@graphprotocol/grc-20';
import { MainVotingAbi, PersonalSpaceAdminAbi } from '@graphprotocol/grc-20/abis';
import { EditProposal } from '@graphprotocol/grc-20/proto';
import { Duration, Effect, Either, Schedule } from 'effect';
import { encodeFunctionData, stringToHex } from 'viem';

import * as React from 'react';

// import { check } from '../check';
import { Triple } from '../database/Triple';
import { getRelations } from '../database/relations';
import { getTriples } from '../database/triples';
import { StoredTriple } from '../database/types';
import { useWriteOps } from '../database/write';
import { TransactionWriteFailedError } from '../errors';
import { IpfsEffectClient } from '../io/ipfs-client';
import { fetchSpace } from '../io/subgraph';
import { useStatusBar } from '../state/status-bar-store';
import { Triple as ITriple, Relation, ReviewState, SpaceGovernanceType } from '../types';
import { Triples } from '../utils/triples';
import { sleepWithCallback } from '../utils/utils';
import { useSmartAccount } from './use-smart-account';

interface MakeProposalOptions {
  triples: ITriple[];
  relations: Relation[];
  spaceId: string;
  name: string;
  onSuccess?: () => void;
  onError?: () => void;
}

export function usePublish() {
  const { restore, restoreRelations } = useWriteOps();
  const { smartAccount } = useSmartAccount();
  const { dispatch } = useStatusBar();

  /**
   * Take the actions for a specific space the user wants to write to Geo and publish them
   * to IPFS + transact the IPFS hash onto the space's blockchain.
   *
   * After the publish flow finishes update the state of the user's actions for the given
   * space with the published actions being flagged as `hasBeenPublished` and run any additional
   * side effects.
   */
  const make = async ({
    triples: triplesToPublish,
    relations,
    name,
    spaceId,
    onSuccess,
    onError,
  }: MakeProposalOptions) => {
    if (!smartAccount) return;
    if (triplesToPublish.length === 0 && relations.length === 0) return;

    const space = await fetchSpace({ id: spaceId });

    const publish = Effect.gen(function* () {
      if (!space) {
        return;
      }

      const { opsToPublish: ops, relationTriples } = Triples.prepareTriplesForPublishing(
        triplesToPublish,
        relations,
        spaceId
      );

      if (ops.length === 0) {
        console.error('resulting ops are empty, cancelling publish');
        return;
      }

      yield* makeProposal({
        name,
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

      const dataBeingPublished = new Set([
        ...triplesToPublish.map(a => {
          return a.id;
        }),
        ...relations.map(a => {
          return a.id;
        }),
      ]);

      // We filter out the actions that are being published from the actionsBySpace. We do this
      // since we need to update the entire state of the space with the published actions and the
      // unpublished actions being merged together.
      // If the actionsBySpace[spaceId] is empty, then we return an empty array
      const nonPublishedTriples = getTriples({
        selector: t => t.space === spaceId && !dataBeingPublished.has(t.id),
      });

      const nonPublishedRelations = getRelations({
        selector: r => r.space === spaceId && !dataBeingPublished.has(r.id),
      });

      const publishedTriples: StoredTriple[] = [...triplesToPublish, ...relationTriples].map(triple =>
        // We keep published relations' ops in memory so we can continue to render any relations
        // as entity pages. These don't actually get published since we publish relations as
        // a CREATE_RELATION and DELETE_RELATION op.
        Triple.make(triple, { hasBeenPublished: true, isDeleted: triple.isDeleted })
      );

      const publishedRelations = relations.map(relation => ({
        ...relation,
        // We keep published actions in memory to keep the UI optimistic. This is mostly done
        // because there is a period between publishing actions and the subgraph finishing indexing
        // where the UI would be in a state where the published actions are not showing up in the UI.
        // Instead we keep the actions in memory so the UI is up-to-date while the subgraph indexes.
        hasBeenPublished: true,
      }));

      restoreRelations([...publishedRelations, ...nonPublishedRelations]);
      restore([...publishedTriples, ...nonPublishedTriples]);
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
  };

  return {
    makeProposal: make,
  };
}

export function useBulkPublish() {
  const { smartAccount } = useSmartAccount();
  const { dispatch } = useStatusBar();

  /**
   * Take the bulk actions for a specific space the user wants to write to Geo and publish them
   * to IPFS + transact the IPFS hash onto Polygon.
   */
  const makeBulkProposal = async ({ triples, relations, name, spaceId, onSuccess, onError }: MakeProposalOptions) => {
    if (triples.length === 0) return;
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
        onChangePublishState: (newState: ReviewState) =>
          dispatch({
            type: 'SET_REVIEW_STATE',
            payload: newState,
          }),
        ops: Triples.prepareTriplesForPublishing(triples, relations, spaceId).opsToPublish,
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
  };

  return {
    makeBulkProposal,
  };
}

interface MakeProposalArgs {
  name: string;
  ops: Op[];
  smartAccount: NonNullable<ReturnType<typeof useSmartAccount>['smartAccount']>;
  space: {
    id: string;
    spacePluginAddress: string;
    mainVotingPluginAddress: string | null;
    personalSpaceAdminPluginAddress: string | null;
    type: SpaceGovernanceType;
  };
  onChangePublishState: (newState: ReviewState) => void;
}

function makeProposal(args: MakeProposalArgs) {
  const { name, ops, smartAccount, space, onChangePublishState } = args;

  const proposal = EditProposal.encode({ name, ops, author: smartAccount.account.address });

  const writeTxEffect = Effect.gen(function* () {
    if (ops.length === 0) {
      return;
    }

    if (space.type === 'PUBLIC' && !space.mainVotingPluginAddress) {
      console.error('public space does not have main voting plugin address');
      return;
    }

    if (space.type === 'PERSONAL' && !space.personalSpaceAdminPluginAddress) {
      console.error('personal space does not have member access plugin address');
      return;
    }

    onChangePublishState('publishing-ipfs');
    const cid = yield* IpfsEffectClient.upload(proposal);
    onChangePublishState('publishing-contract');

    // yield* check(() => cid.startsWith('ipfs://'), 'CID does not start with ipfs://');
    // yield* check(() => cidContains !== undefined && cidContains !== '', 'CID is not valid');

    const callData = getCalldataForSpaceGovernanceType({
      type: space.type,
      cid,
      spacePluginAddress: space.spacePluginAddress,
    });

    const execute = Effect.tryPromise({
      try: async () => {
        return await smartAccount.sendTransaction({
          to:
            space.type === 'PUBLIC'
              ? (space.mainVotingPluginAddress as `0x${string}`)
              : (space.personalSpaceAdminPluginAddress as `0x${string}`),
          value: 0n,
          data: callData,
        });
      },
      catch: error => new TransactionWriteFailedError(`Publish failed: ${error}`),
    });

    return yield* Effect.retry(
      execute,
      Schedule.exponential('100 millis').pipe(
        Schedule.jittered,
        Schedule.compose(Schedule.elapsed),
        Schedule.tapInput(() => Effect.succeed(console.log('[PUBLISH][makeProposal] Retrying'))),
        Schedule.whileOutput(Duration.lessThanOrEqualTo(Duration.seconds(30)))
      )
    );
  });

  const publishProgram = Effect.gen(function* () {
    const writeTxHash = yield* writeTxEffect;
    console.log('Transaction hash: ', writeTxHash);
    return writeTxHash;
  });

  return publishProgram;
}

type GovernanceTypeCalldataArgs = {
  type: SpaceGovernanceType;
  cid: string;
  spacePluginAddress: string;
};

function getCalldataForSpaceGovernanceType(args: GovernanceTypeCalldataArgs) {
  switch (args.type) {
    case 'PUBLIC':
      return encodeFunctionData({
        functionName: 'proposeEdits',
        abi: MainVotingAbi,
        args: [stringToHex(args.cid), args.cid, args.spacePluginAddress as `0x${string}`],
      });
    case 'PERSONAL':
      return encodeFunctionData({
        functionName: 'submitEdits',
        abi: PersonalSpaceAdminAbi,
        args: [args.cid, args.spacePluginAddress as `0x${string}`],
      });
  }
}
