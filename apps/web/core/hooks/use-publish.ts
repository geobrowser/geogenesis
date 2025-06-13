import { Op } from '@graphprotocol/grc-20';
import { CreateRelationOp, DeleteRelationOp, Id } from '@graphprotocol/grc-20';
import { MainVotingAbi, PersonalSpaceAdminAbi } from '@graphprotocol/grc-20/abis';
import { EditProposal } from '@graphprotocol/grc-20/proto';
import { Duration, Effect, Either, Schedule } from 'effect';
import { encodeFunctionData, stringToHex } from 'viem';

import * as React from 'react';

import { Relation, Value } from '~/core/v2.types';

// import { check } from '../check';
import { TransactionWriteFailedError } from '../errors';
import { IpfsEffectClient } from '../io/ipfs-client';
import { getSpace } from '../io/v2/queries';
import { useStatusBar } from '../state/status-bar-store';
import { ReviewState, SpaceGovernanceType } from '../types';
import { Publish } from '../utils/publish';
import { sleepWithCallback } from '../utils/utils';
import { useSmartAccount } from './use-smart-account';

interface MakeProposalOptions {
  values: Value[];
  relations: Relation[];
  spaceId: string;
  name: string;
  onSuccess?: () => void;
  onError?: () => void;
}

export function usePublish() {
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
  const make = React.useCallback(
    async ({ values: valuesToPublish, relations, name, spaceId, onSuccess, onError }: MakeProposalOptions) => {
      if (!smartAccount) return;
      if (valuesToPublish.length === 0 && relations.length === 0) return;

      const space = await Effect.runPromise(getSpace(spaceId));

      const publish = Effect.gen(function* () {
        if (!space) {
          return;
        }

        const { opsToPublish: ops } = Publish.prepareLocalDataForPublishing(valuesToPublish, relations, spaceId);

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
            spacePluginAddress: space.spaceAddress,
            mainVotingPluginAddress: space.mainVotingAddress,
            personalSpaceAdminPluginAddress: space.personalAddress,
            type: space.type,
          },
        });

        // const dataBeingPublished = new Set([
        //   ...valuesToPublish.map(a => {
        //     return a.id;
        //   }),
        //   ...relations.map(a => {
        //     return a.id;
        //   }),
        // ]);

        // We filter out the actions that are being published from the actionsBySpace. We do this
        // since we need to update the entire state of the space with the published actions and the
        // unpublished actions being merged together.
        // If the actionsBySpace[spaceId] is empty, then we return an empty array
        // const nonPublishedTriples = getValues({
        //   selector: t => t.spaceId === spaceId && !dataBeingPublished.has(t.id),
        // });

        // const nonPublishedRelations = getRelations({
        //   selector: r => r.spaceId === spaceId && !dataBeingPublished.has(r.id),
        // });

        // const publishedTriples: StoredTriple[] = [...valuesToPublish, ...relationTriples].map(triple =>
        //   // We keep published relations' ops in memory so we can continue to render any relations
        //   // as entity pages. These don't actually get published since we publish relations as
        //   // a CREATE_RELATION and DELETE_RELATION op.
        //   Triple.make(triple, { hasBeenPublished: true, isDeleted: triple.isDeleted })
        // );

        // const publishedRelations = relations.map(relation => ({
        //   ...relation,
        //   // We keep published actions in memory to keep the UI optimistic. This is mostly done
        //   // because there is a period between publishing actions and the subgraph finishing indexing
        //   // where the UI would be in a state where the published actions are not showing up in the UI.
        //   // Instead we keep the actions in memory so the UI is up-to-date while the subgraph indexes.
        //   hasBeenPublished: true,
        // }));

        // @TODO(migration): Correctly update published and non-published data.
        // restoreRelations([...publishedRelations, ...nonPublishedRelations]);
        // restore([...publishedTriples, ...nonPublishedTriples]);
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
    [smartAccount, dispatch]
  );

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
  const makeBulkProposal = React.useCallback(
    async ({ values: triples, relations, name, spaceId, onSuccess, onError }: MakeProposalOptions) => {
      if (triples.length === 0) return;
      if (!smartAccount) return;

      // @TODO(governance): Pass this to either the makeProposal call or to usePublish.
      // All of our contract calls rely on knowing plugin metadata so this is probably
      // something we need for all of them.
      const space = await Effect.runPromise(getSpace(spaceId));

      const publish = Effect.gen(function* () {
        if (!space || !space.mainVotingAddress) {
          return;
        }

        yield* makeProposal({
          name,
          onChangePublishState: (newState: ReviewState) =>
            dispatch({
              type: 'SET_REVIEW_STATE',
              payload: newState,
            }),
          ops: Publish.prepareLocalDataForPublishing(triples, relations, spaceId).opsToPublish,
          smartAccount,
          space: {
            id: space.id,
            spacePluginAddress: space.spaceAddress,
            mainVotingPluginAddress: space.mainVotingAddress,
            personalSpaceAdminPluginAddress: space.personalAddress,
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
    [smartAccount, dispatch]
  );

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

export function timestamp() {
  return new Date().toISOString();
}

export function prepareLocalDataForPublishing(values: Value[], relations: Relation[], spaceId: string) {
  const validValues = values.filter(
    // Deleted ops have a value of ''. Make sure we don't filter those out
    v => v.spaceId === spaceId && !v.hasBeenPublished && v.property.id !== '' && v.entity.id !== ''
  );

  const relationOps = relations.map((r): CreateRelationOp | DeleteRelationOp => {
    if (r.isDeleted) {
      return {
        type: 'DELETE_RELATION',
        id: Id.Id(r.id),
      };
    }

    return {
      type: 'CREATE_RELATION',
      relation: {
        id: Id.Id(r.id),
        type: Id.Id(r.type.id),
        entity: Id.Id(r.entityId),
        fromEntity: Id.Id(r.fromEntity.id),
        toEntity: Id.Id(r.toEntity.id),
        position: r.position ?? undefined,
        verified: r.verified ?? undefined,
        toSpace: r.toSpaceId ? Id.Id(r.toSpaceId) : undefined,
      },
    };
  });

  // @TODO(migration): Need to group values and squash into Entity ops
  // const tripleOps = validValues.map((t): SetTripleOp | DeleteTripleOp => {
  //   if (t.isDeleted) {
  //     return {
  //       type: 'DELETE_TRIPLE',
  //       triple: {
  //         entity: t.entityId,
  //         attribute: t.attributeId,
  //       },
  //     };
  //   }

  //   return {
  //     type: 'SET_TRIPLE',
  //     triple: {
  //       entity: t.entityId,
  //       attribute: t.attributeId,
  //       value: {
  //         type: t.value.type,
  //         value: t.value.value,
  //         ...(t.value.options !== undefined && {
  //           options: Object.fromEntries(Object.entries(t.value.options).filter(([, v]) => v !== undefined)),
  //         }),
  //       },
  //     },
  //   };
  // });

  return {
    opsToPublish: [...relationOps],
  };
}
