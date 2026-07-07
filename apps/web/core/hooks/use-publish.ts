'use client';

import { Op } from '@geoprotocol/geo-sdk/lite';

import * as React from 'react';

import { Duration, Effect, Either, Schedule } from 'effect';

import { getSpaceAccess } from '~/core/access/space-access';
import { Relation, Value } from '~/core/types';

import { TransactionWriteFailedError } from '../errors';
import { getSpace } from '../io/queries';
import { geo } from '../sdk/geo-client';
import { useStatusBar } from '../state/status-bar-store';
import { useMutate } from '../sync/use-mutate';
import { runEffectEither } from '../telemetry/effect-runtime';
import { ReviewState, SpaceGovernanceType } from '../types';
import { isUserRejection, toUserFacingError } from '../utils/error-diagnostics';
import { Publish } from '../utils/publish';
import { sleepWithCallback } from '../utils/utils';
import { usePersonalSpaceId } from './use-personal-space-id';
import { useSmartAccount } from './use-smart-account';

/** Fast path (instant execution for editors) vs review/slow path (voting period). */
export type ProposalVotingMode = 'FAST' | 'SLOW';

interface MakeProposalOptions {
  values: Value[];
  relations: Relation[];
  spaceId: string;
  name: string;
  /** Optional proposal ID (Geo entity ID format). For DAO spaces this is forwarded to daoSpace.proposeEdit. */
  proposalId?: string;
  /**
   * Editor-chosen path for DAO proposals (design 62501-94092). Ignored for non-editors
   * and personal spaces — members can only ever use the slow path.
   */
  votingMode?: ProposalVotingMode;
  onSuccess?: () => void;
  onError?: () => void;
}

export function usePublish() {
  const { smartAccount } = useSmartAccount();
  const { personalSpaceId } = usePersonalSpaceId();
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
    async ({
      values: valuesToPublish,
      relations,
      name,
      spaceId,
      proposalId,
      votingMode,
      onSuccess,
      onError,
    }: MakeProposalOptions) => {
      if (!smartAccount) {
        onError?.();
        dispatch({
          type: 'ERROR',
          payload: 'Unable to publish: wallet is not connected. Please reconnect and try again.',
        });
        return;
      }
      if (!personalSpaceId) {
        onError?.();
        dispatch({
          type: 'ERROR',
          payload: 'Unable to publish: your personal space could not be resolved. Please complete onboarding.',
        });
        return;
      }
      if (valuesToPublish.length === 0 && relations.length === 0) {
        onError?.();
        dispatch({
          type: 'ERROR',
          payload: 'Nothing to publish: no changes were detected for this space.',
        });
        return;
      }

      const publish = Effect.gen(function* () {
        const space = yield* getSpace(spaceId);

        if (!space) {
          return yield* Effect.fail(
            new TransactionWriteFailedError(`Unable to publish: space ${spaceId} could not be loaded.`)
          );
        }

        const ops = yield* Publish.prepareLocalDataForPublishing(valuesToPublish, relations, spaceId);

        if (ops.length === 0) {
          console.error('resulting ops are empty, cancelling publish', {
            values: valuesToPublish,
            relations,
            spaceId,
          });
          return yield* Effect.fail(
            new TransactionWriteFailedError(
              'Nothing to publish: your changes resolved to an empty edit. Please add or modify content and try again.'
            )
          );
        }

        const spaceAccess = yield* getSpaceAccess(space, personalSpaceId);

        yield* makeProposal({
          name,
          author: personalSpaceId,
          proposalId,
          votingMode,
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
            isEditor: spaceAccess.isEditor,
          },
        });

        storage.setAsPublished(
          valuesToPublish.map(v => v.id),
          relations.map(r => r.id)
        );
      });

      const result = await runEffectEither(publish);

      if (Either.isLeft(result)) {
        onError?.();

        if (isUserRejection(result.left)) {
          dispatch({ type: 'SET_REVIEW_STATE', payload: 'idle' });
          return;
        }

        const { message, retry } = toUserFacingError(result.left);
        dispatch({ type: 'ERROR', payload: message, retry });
        return;
      }

      dispatch({ type: 'SET_REVIEW_STATE', payload: 'publish-complete' });

      // want to show the "complete" state for 3s if it succeeds
      await sleepWithCallback(() => {
        dispatch({ type: 'SET_REVIEW_STATE', payload: 'idle' });
        onSuccess?.();
      }, 3000);
    },
    [smartAccount, personalSpaceId, dispatch, storage]
  );

  return {
    makeProposal: make,
  };
}

export function useBulkPublish() {
  const { smartAccount } = useSmartAccount();
  const { personalSpaceId } = usePersonalSpaceId();
  const { dispatch } = useStatusBar();
  const { storage } = useMutate();

  /**
   * Take the bulk actions for a specific space the user wants to write to Geo and publish them
   * to IPFS + transact the IPFS hash onto Polygon.
   */
  const makeBulkProposal = React.useCallback(
    async ({ values: triples, relations, name, spaceId, onSuccess, onError }: MakeProposalOptions) => {
      if (triples.length === 0) {
        onError?.();
        dispatch({
          type: 'ERROR',
          payload: 'Nothing to publish: no changes were detected for this space.',
        });
        return;
      }
      if (!smartAccount) {
        onError?.();
        dispatch({
          type: 'ERROR',
          payload: 'Unable to publish: wallet is not connected. Please reconnect and try again.',
        });
        return;
      }
      if (!personalSpaceId) {
        onError?.();
        dispatch({
          type: 'ERROR',
          payload: 'Unable to publish: your personal space could not be resolved. Please complete onboarding.',
        });
        return;
      }

      const publish = Effect.gen(function* () {
        // @TODO(governance): Pass this to either the makeProposal call or to usePublish.
        // All of our contract calls rely on knowing plugin metadata so this is probably
        // something we need for all of them.
        const space = yield* getSpace(spaceId);

        if (!space) {
          return yield* Effect.fail(
            new TransactionWriteFailedError(`Unable to publish: space ${spaceId} could not be loaded.`)
          );
        }

        const ops = yield* Publish.prepareLocalDataForPublishing(triples, relations, spaceId);
        const spaceAccess = yield* getSpaceAccess(space, personalSpaceId);

        yield* makeProposal({
          name,
          author: personalSpaceId,
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
            isEditor: spaceAccess.isEditor,
          },
        });
      });

      const result = await runEffectEither(publish);

      if (Either.isLeft(result)) {
        onError?.();

        if (isUserRejection(result.left)) {
          dispatch({ type: 'SET_REVIEW_STATE', payload: 'idle' });
          return;
        }

        const { message, retry } = toUserFacingError(result.left);
        dispatch({ type: 'ERROR', payload: message, retry });
        return;
      }

      storage.setAsPublished(
        triples.map(v => v.id),
        relations.map(r => r.id)
      );
      dispatch({ type: 'SET_REVIEW_STATE', payload: 'publish-complete' });
      onSuccess?.();

      // want to show the "complete" state for 3s if it succeeds
      await sleepWithCallback(() => dispatch({ type: 'SET_REVIEW_STATE', payload: 'idle' }), 3000);
    },
    [smartAccount, personalSpaceId, dispatch, storage]
  );

  return {
    makeBulkProposal,
  };
}

interface MakeProposalArgs {
  name: string;
  /** The author's personal space ID. */
  author: string;
  ops: Op[];
  /** Optional proposal ID (Geo entity ID format, 32 hex chars). Forwarded to daoSpace.proposeEdit as `0x${proposalId}`. */
  proposalId?: string;
  /** Editor-chosen path for DAO proposals; only honored when the caller is an editor. */
  votingMode?: ProposalVotingMode;
  smartAccount: NonNullable<ReturnType<typeof useSmartAccount>['smartAccount']>;
  space: {
    id: string;
    type: SpaceGovernanceType;
    address: string;
    isEditor: boolean;
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
  const { name, author, ops, proposalId, votingMode: requestedVotingMode, smartAccount, space, onChangePublishState } =
    args;

  return Effect.gen(function* () {
    if (ops.length === 0) {
      return;
    }

    onChangePublishState('publishing-ipfs');

    let to: `0x${string}`;
    let calldata: `0x${string}`;

    if (space.type === 'DAO') {
      // DAO spaces: use daoSpace.proposeEdit()
      // `author` is the caller's personal space ID, already validated as non-null
      // by the guard in usePublish/useBulkPublish before makeProposal is called.

      // Editors can use the fast path for immediate execution and now choose it
      // explicitly via the review-screen selector (design 62501-94092); absent a
      // choice they default to FAST. Members can only ever use the slow path (a
      // voting period), so a stray FAST request from a non-editor is ignored.
      // FAST is valid even when the DAO's flatSupportThreshold is 0 — the contract
      // accepts votes on those proposals as of the backend fix (previously they
      // reverted with CanNotVote()).
      const votingMode: ProposalVotingMode = space.isEditor ? (requestedVotingMode ?? 'FAST') : 'SLOW';

      const result = yield* Effect.retry(
        Effect.tryPromise({
          try: () =>
            geo.daoSpaces.proposeEdit({
              name,
              ops,
              author,
              daoSpaceAddress: space.address as `0x${string}`,
              callerSpaceId: `0x${author}`,
              daoSpaceId: `0x${space.id}`,
              votingMode,
              ...(proposalId ? { proposalId: `0x${proposalId}` as `0x${string}` } : {}),
            }),
          catch: error => {
            console.error('[PUBLISH] daoSpace.proposeEdit failed:', error);
            return new TransactionWriteFailedError('IPFS upload failed', { cause: error });
          },
        }).pipe(
          Effect.withSpan('web.write.publishEdit.dao'),
          Effect.annotateSpans({
            'io.operation': 'publish_edit',
            'io.path': 'dao',
            'space.type': 'DAO',
            'governance.action': 'proposal_created',
          })
        ),
        retrySchedule('proposeEdit', Duration.minutes(1))
      );

      to = result.to as `0x${string}`;
      calldata = result.calldata as `0x${string}`;
    } else {
      // Personal spaces: use personalSpace.publishEdit()
      const result = yield* Effect.retry(
        Effect.tryPromise({
          try: () =>
            geo.personalSpaces.publishEdit({
              name,
              spaceId: space.id,
              ops,
              author,
            }),
          catch: error => {
            console.error('[PUBLISH] personalSpace.publishEdit failed:', error);
            return new TransactionWriteFailedError('IPFS upload failed', { cause: error });
          },
        }).pipe(
          Effect.withSpan('web.write.publishEdit.personal'),
          Effect.annotateSpans({
            'io.operation': 'publish_edit',
            'io.path': 'personal',
            'space.type': 'PERSONAL',
          })
        ),
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
      }).pipe(
        Effect.withSpan('web.write.submitUserOperation'),
        Effect.annotateSpans({
          'io.operation': 'submit_user_operation',
        })
      ),
      retrySchedule('sendUserOperation', Duration.seconds(10))
    );

    console.log('Transaction hash: ', result);
    return result;
  });
}
