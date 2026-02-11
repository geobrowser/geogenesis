'use client';

import { IdUtils, Op, daoSpace, personalSpace } from '@geoprotocol/geo-sdk';
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
import { useGeoProfile } from './use-geo-profile';
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
  const { profile } = useGeoProfile(smartAccount?.account.address);
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
      if (!profile) {
        onError?.();
        dispatch({ type: 'ERROR', payload: 'Profile is still loading. Please try again.' });
        return;
      }
      if (!IdUtils.isValid(profile.id)) {
        onError?.();
        dispatch({
          type: 'ERROR',
          payload: 'Unable to publish: your profile entity ID could not be resolved. Please complete onboarding.',
        });
        return;
      }
      if (valuesToPublish.length === 0 && relations.length === 0) return;

      const space = await Effect.runPromise(getSpace(spaceId));

      if (!space) return;

      const publish = Effect.gen(function* () {
        const ops = yield* Publish.prepareLocalDataForPublishing(valuesToPublish, relations, spaceId);

        if (ops.length === 0) {
          console.error('resulting ops are empty, cancelling publish', {
            values: valuesToPublish,
            relations,
            spaceId,
          });
          return;
        }

        yield* makeProposal({
          name,
          author: profile.id,
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
            editors: space.editors,
          },
        });

        storage.setAsPublished(
          valuesToPublish.map(v => v.id),
          relations.map(r => r.id)
        );
      });

      const result = await Effect.runPromise(Effect.either(publish));

      if (Either.isLeft(result)) {
        onError?.();

        if (isUserRejection(result.left)) {
          dispatch({ type: 'SET_REVIEW_STATE', payload: 'idle' });
          return;
        }

        dispatch({ type: 'ERROR', payload: result.left.message });
        return;
      }

      dispatch({ type: 'SET_REVIEW_STATE', payload: 'publish-complete' });

      // want to show the "complete" state for 3s if it succeeds
      await sleepWithCallback(() => {
        dispatch({ type: 'SET_REVIEW_STATE', payload: 'idle' });
        onSuccess?.();
      }, 3000);
    },
    [smartAccount, profile, dispatch, storage]
  );

  return {
    makeProposal: make,
  };
}

export function useBulkPublish() {
  const { smartAccount } = useSmartAccount();
  const { profile } = useGeoProfile(smartAccount?.account.address);
  const { dispatch } = useStatusBar();

  /**
   * Take the bulk actions for a specific space the user wants to write to Geo and publish them
   * to IPFS + transact the IPFS hash onto Polygon.
   */
  const makeBulkProposal = React.useCallback(
    async ({ values: triples, relations, name, spaceId, onSuccess, onError }: MakeProposalOptions) => {
      if (triples.length === 0) return;
      if (!smartAccount) return;
      if (!profile) {
        onError?.();
        dispatch({ type: 'ERROR', payload: 'Profile is still loading. Please try again.' });
        return;
      }
      if (!IdUtils.isValid(profile.id)) {
        onError?.();
        dispatch({
          type: 'ERROR',
          payload: 'Unable to publish: your profile entity ID could not be resolved. Please complete onboarding.',
        });
        return;
      }

      // @TODO(governance): Pass this to either the makeProposal call or to usePublish.
      // All of our contract calls rely on knowing plugin metadata so this is probably
      // something we need for all of them.
      const space = await Effect.runPromise(getSpace(spaceId));

      if (!space) return;

      const publish = Effect.gen(function* () {
        const ops = yield* Publish.prepareLocalDataForPublishing(triples, relations, spaceId);

        yield* makeProposal({
          name,
          author: profile.id,
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
            editors: space.editors,
          },
        });
      });

      const result = await Effect.runPromise(Effect.either(publish));

      if (Either.isLeft(result)) {
        onError?.();

        if (isUserRejection(result.left)) {
          dispatch({ type: 'SET_REVIEW_STATE', payload: 'idle' });
          return;
        }

        dispatch({ type: 'ERROR', payload: result.left.message });
        return;
      }

      dispatch({ type: 'SET_REVIEW_STATE', payload: 'publish-complete' });
      onSuccess?.();

      // want to show the "complete" state for 3s if it succeeds
      await sleepWithCallback(() => dispatch({ type: 'SET_REVIEW_STATE', payload: 'idle' }), 3000);
    },
    [smartAccount, profile, dispatch]
  );

  return {
    makeBulkProposal,
  };
}

/**
 * Check whether an error (or any error in its cause chain) is a wallet
 * user-rejection. Walks the cause chain since we now nest the original
 * error via `{ cause }` rather than string interpolation.
 */
function isUserRejection(error: unknown): boolean {
  let current = error instanceof Error ? error : undefined;
  while (current) {
    if (current.message.includes('User rejected the request') || current.name === 'UserRejectedRequestError') {
      return true;
    }
    current = current.cause instanceof Error ? current.cause : undefined;
  }
  return false;
}

interface MakeProposalArgs {
  name: string;
  /** The author's Person Entity ID (front page entity of their personal space). */
  author: string;
  ops: Op[];
  smartAccount: NonNullable<ReturnType<typeof useSmartAccount>['smartAccount']>;
  space: {
    id: string;
    type: SpaceGovernanceType;
    address: string;
    editors: string[];
  };
  onChangePublishState: (newState: ReviewState) => void;
}

/**
 * Retry schedule for network calls during publish.
 * Exponential backoff starting at 100ms with jitter, retries for up to the
 * given duration. Logs each retry attempt with a label for diagnostics.
 */
function retrySchedule(label: string, maxDuration: Duration.DurationInput) {
  return Schedule.exponential('100 millis').pipe(
    Schedule.jittered,
    Schedule.compose(Schedule.elapsed),
    Schedule.tapInput(() => Effect.succeed(console.log(`[PUBLISH][${label}] Retrying`))),
    Schedule.whileOutput(Duration.lessThanOrEqualTo(Duration.decode(maxDuration)))
  );
}

function makeProposal(args: MakeProposalArgs) {
  const { name, author, ops, smartAccount, space, onChangePublishState } = args;

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
      const callerSpaceId = yield* Effect.retry(
        Effect.tryPromise({
          try: () => getPersonalSpaceId(smartAccount.account.address),
          catch: error => {
            console.error('[PUBLISH] getPersonalSpaceId failed:', error);
            return new TransactionWriteFailedError('Failed to get personal space ID', { cause: error });
          },
        }),
        retrySchedule('getPersonalSpaceId', Duration.seconds(10))
      );

      if (!callerSpaceId) {
        yield* Effect.fail(
          new TransactionWriteFailedError('You need a personal space to propose edits to a DAO space')
        );
        // Unreachable, but helps TypeScript narrow the type
        return;
      }

      // Editors can use the fast path for immediate execution.
      // Members must use the slow path which requires a voting period.
      const isEditor = space.editors.map(s => s.toLowerCase()).includes(callerSpaceId.toLowerCase());
      const votingMode = isEditor ? 'FAST' : 'SLOW';

      const result = yield* Effect.retry(
        Effect.tryPromise({
          try: () =>
            daoSpace.proposeEdit({
              name,
              ops,
              author,
              daoSpaceAddress: space.address as `0x${string}`,
              callerSpaceId: `0x${callerSpaceId}`,
              daoSpaceId: `0x${space.id}`,
              votingMode,
              network: 'TESTNET',
            }),
          catch: error => {
            console.error('[PUBLISH] daoSpace.proposeEdit failed:', error);
            return new TransactionWriteFailedError('IPFS upload failed', { cause: error });
          },
        }),
        retrySchedule('proposeEdit', Duration.minutes(1))
      );

      to = result.to as `0x${string}`;
      calldata = result.calldata as `0x${string}`;
    } else {
      // Personal spaces: use personalSpace.publishEdit()
      const result = yield* Effect.retry(
        Effect.tryPromise({
          try: () =>
            personalSpace.publishEdit({
              name,
              spaceId: space.id,
              ops,
              author,
              network: 'TESTNET',
            }),
          catch: error => {
            console.error('[PUBLISH] personalSpace.publishEdit failed:', error);
            return new TransactionWriteFailedError('IPFS upload failed', { cause: error });
          },
        }),
        retrySchedule('publishEdit', Duration.minutes(1))
      );

      to = result.to;
      calldata = result.calldata;
    }

    onChangePublishState('publishing-contract');

    const result = yield* Effect.retry(
      Effect.tryPromise({
        try: () =>
          smartAccount.sendUserOperation({
            calls: [{ to, value: 0n, data: calldata }],
          }),
        catch: error => {
          console.error('[PUBLISH] sendUserOperation failed:', error);
          return new TransactionWriteFailedError('Publish failed', { cause: error });
        },
      }),
      retrySchedule('sendUserOperation', Duration.seconds(10))
    );

    console.log('Transaction hash: ', result);
    return result;
  });
}
