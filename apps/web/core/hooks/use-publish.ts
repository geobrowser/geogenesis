'use client';

import { Op, daoSpace, personalSpace } from '@geoprotocol/geo-sdk';
import { Duration, Effect, Either, Schedule } from 'effect';

import * as React from 'react';

import { Relation, Value } from '~/core/types';

import { TransactionWriteFailedError } from '../errors';
import { getSpace } from '../io/queries';
import { useStatusBar } from '../state/status-bar-store';
import { useMutate } from '../sync/use-mutate';
import { ReviewState, SpaceGovernanceType } from '../types';
import { getPersonalSpaceId } from '../utils/contracts/get-personal-space-id';
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
  const { storage } = useMutate();

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

        const ops = Publish.prepareLocalDataForPublishing(valuesToPublish, relations, spaceId);

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
            type: space.type,
            address: space.address,
          },
        });

        storage.setAsPublished(
          valuesToPublish.map(v => v.id),
          relations.map(r => r.id)
        );
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
    [smartAccount, dispatch, storage]
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
        if (!space) {
          return;
        }

        yield* makeProposal({
          name,
          onChangePublishState: (newState: ReviewState) =>
            dispatch({
              type: 'SET_REVIEW_STATE',
              payload: newState,
            }),
          ops: Publish.prepareLocalDataForPublishing(triples, relations, spaceId),
          smartAccount,
          space: {
            id: space.id,
            type: space.type,
            address: space.address,
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
    type: SpaceGovernanceType;
    address: string;
  };
  onChangePublishState: (newState: ReviewState) => void;
}

function makeProposal(args: MakeProposalArgs) {
  const { name, ops, smartAccount, space, onChangePublishState } = args;

  return Effect.gen(function* () {
    if (ops.length === 0) {
      return;
    }

    onChangePublishState('publishing-ipfs');

    let to: `0x${string}`;
    let calldata: `0x${string}`;

    if (space.type === 'DAO') {
      // DAO spaces: use daoSpace.proposeEdit()
      // Get the caller's personal space ID (required for DAO proposals)
      const callerSpaceId = yield* Effect.tryPromise({
        try: () => getPersonalSpaceId(smartAccount.account.address),
        catch: error => new TransactionWriteFailedError(`Failed to get personal space ID: ${error}`),
      });

      if (!callerSpaceId) {
        throw new TransactionWriteFailedError('You need a personal space to propose edits to a DAO space');
      }

      const result = yield* Effect.tryPromise({
        try: () =>
          daoSpace.proposeEdit({
            name,
            ops,
            author: smartAccount.account.address,
            daoSpaceAddress: space.address as `0x${string}`,
            callerSpaceId: `0x${callerSpaceId}`,
            daoSpaceId: `0x${space.id}`,
            network: 'TESTNET',
          }),
        catch: error => new TransactionWriteFailedError(`IPFS upload failed: ${error}`),
      });

      to = result.to as `0x${string}`;
      calldata = result.calldata as `0x${string}`;
    } else {
      // Personal spaces: use personalSpace.publishEdit()
      const result = yield* Effect.tryPromise({
        try: () =>
          personalSpace.publishEdit({
            name,
            spaceId: space.id,
            ops,
            author: smartAccount.account.address,
            network: 'TESTNET',
          }),
        catch: error => new TransactionWriteFailedError(`IPFS upload failed: ${error}`),
      });

      to = result.to;
      calldata = result.calldata;
    }

    onChangePublishState('publishing-contract');

    const execute = Effect.tryPromise({
      try: () =>
        smartAccount.sendUserOperation({
          calls: [{ to, value: 0n, data: calldata }],
        }),
      catch: error => new TransactionWriteFailedError(`Publish failed: ${error}`),
    });

    const result = yield* Effect.retry(
      execute,
      Schedule.exponential('100 millis').pipe(
        Schedule.jittered,
        Schedule.compose(Schedule.elapsed),
        Schedule.tapInput(() => Effect.succeed(console.log('[PUBLISH][makeProposal] Retrying'))),
        Schedule.whileOutput(Duration.lessThanOrEqualTo(Duration.seconds(10)))
      )
    );

    console.log('Transaction hash: ', result);
    return result;
  });
}
