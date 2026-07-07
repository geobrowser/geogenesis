'use client';

import * as React from 'react';

import { Duration, Effect, Either, Schedule } from 'effect';

import { TransactionWriteFailedError } from '~/core/errors';
import { geo } from '~/core/sdk/geo-client';
import { runEffectEither } from '~/core/telemetry/effect-runtime';

import type { VotingSettingsInput } from '~/partials/governance/voting-settings';

import { usePersonalSpaceId } from './use-personal-space-id';
import { useSmartAccount } from './use-smart-account';

type ProposeVotingSettingsArgs = {
  /** The DAO space's Geo ID (32 hex chars, no dashes). */
  spaceId: string;
  /** The DAO space contract address. */
  daoSpaceAddress: `0x${string}`;
  votingSettings: VotingSettingsInput;
};

/**
 * Proposes a change to a DAO space's voting settings. Updating settings is a SLOW-path
 * governance action (the SDK forbids fast-path here), so this always creates a proposal
 * that editors then vote on — it never applies changes directly.
 *
 * The calldata build is synchronous; only the on-chain submission is retried, mirroring
 * the at-most-once submission discipline used by usePublish.
 */
export function useProposeVotingSettings() {
  const { smartAccount } = useSmartAccount();
  const { personalSpaceId } = usePersonalSpaceId();
  const [isPending, setIsPending] = React.useState(false);

  const propose = React.useCallback(
    async ({ spaceId, daoSpaceAddress, votingSettings }: ProposeVotingSettingsArgs) => {
      if (!smartAccount) {
        throw new TransactionWriteFailedError(
          'Unable to propose: wallet is not connected. Please reconnect and try again.'
        );
      }
      if (!personalSpaceId) {
        throw new TransactionWriteFailedError(
          'Unable to propose: your personal space could not be resolved. Please complete onboarding.'
        );
      }

      setIsPending(true);
      try {
        const submit = Effect.gen(function* () {
          const { to, calldata } = yield* Effect.try({
            try: () =>
              geo.daoSpaces.proposeUpdateVotingSettings({
                authorSpaceId: `0x${personalSpaceId}`,
                spaceId: `0x${spaceId}`,
                daoSpaceAddress,
                votingSettings,
              }),
            catch: error =>
              new TransactionWriteFailedError('Failed to build the voting settings proposal.', { cause: error }),
          });

          return yield* Effect.retry(
            Effect.tryPromise({
              try: () =>
                smartAccount.sendUserOperation({
                  calls: [{ to: to as `0x${string}`, value: 0n, data: calldata as `0x${string}` }],
                }),
              catch: error => new TransactionWriteFailedError('Failed to submit the proposal.', { cause: error }),
            }).pipe(
              Effect.withSpan('web.write.proposeUpdateVotingSettings'),
              Effect.annotateSpans({
                'io.operation': 'submit_user_operation',
                'space.type': 'DAO',
                'governance.action': 'update_voting_settings',
              })
            ),
            Schedule.exponential('100 millis').pipe(
              Schedule.jittered,
              Schedule.compose(Schedule.elapsed),
              Schedule.whileOutput(Duration.lessThanOrEqualTo(Duration.seconds(10)))
            )
          );
        });

        const result = await runEffectEither(submit);
        if (Either.isLeft(result)) {
          throw result.left;
        }
        return result.right;
      } finally {
        setIsPending(false);
      }
    },
    [smartAccount, personalSpaceId]
  );

  return { propose, isPending };
}
