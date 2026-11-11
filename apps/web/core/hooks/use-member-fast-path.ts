'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useCallback, useRef } from 'react';

import { Effect, Either } from 'effect';

import { FAST_PATH_RESTRICTED_QUERY_KEY } from '~/core/hooks/use-fast-path-restricted';
import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { useSmartAccountTransaction } from '~/core/hooks/use-smart-account-transaction';
import { useSpace } from '~/core/hooks/use-space';
import { geo } from '~/core/sdk/geo-client';
import { useStatusBar } from '~/core/state/status-bar-store';
import { runEffectEither } from '~/core/telemetry/effect-runtime';
import { validateSpaceId } from '~/core/utils/utils';

/**
 * - `give_fast_path`: SLOW proposal lifting the person's restriction.
 * - `make_review_only`: immediate editor action restricting the person. No proposal.
 * - `add_back_with_fast_path`: SLOW proposal re-adding someone who left while restricted, and
 *   lifting the restriction. (Re-adding without lifting it is plain `useProposeAddMember`.)
 */
export type MemberFastPathAction = 'give_fast_path' | 'make_review_only' | 'add_back_with_fast_path';

type EncodeParams = { authorSpaceId: string; spaceId: string; memberSpaceId: string };

const ACTIONS = {
  give_fast_path: {
    encode: ({ memberSpaceId, ...params }: EncodeParams) =>
      geo.daoSpaces.proposeUnrestrictMember({ ...params, restrictedMemberSpaceId: memberSpaceId }),
    span: 'web.write.createProposal.unrestrictSpace',
    attributes: { 'io.operation': 'create_proposal', 'governance.action': 'proposal_created' },
  },
  make_review_only: {
    encode: (params: EncodeParams) => geo.daoSpaces.restrictMemberFastPath(params),
    span: 'web.write.restrictSpaceFastPath',
    attributes: { 'io.operation': 'restrict_fast_path', 'governance.action': 'space_fast_path_restricted' },
  },
  add_back_with_fast_path: {
    encode: ({ memberSpaceId, ...params }: EncodeParams) =>
      geo.daoSpaces.proposeAddMemberWithFastPath({ ...params, newMemberSpaceId: memberSpaceId }),
    span: 'web.write.createProposal.addMemberWithFastPath',
    attributes: { 'io.operation': 'create_proposal', 'governance.action': 'proposal_created' },
  },
} as const;

/**
 * Changes one person's fast-path access in a DAO space, for editors. Modelled on
 * `useProposeRemoveEditor`.
 *
 * Only `make_review_only` takes effect immediately: lifting a restriction is a governance action on
 * the DAO contract, so the other two create a review-path proposal that editors vote on.
 */
export function useMemberFastPath({ spaceId, action }: { spaceId: string; action: MemberFastPathAction }) {
  const { dispatch } = useStatusBar();
  const queryClient = useQueryClient();
  const { smartAccount } = useSmartAccount();
  const { personalSpaceId, isRegistered } = usePersonalSpaceId();
  const { space } = useSpace(spaceId);
  const tx = useSmartAccountTransaction();
  // Retry from the status bar through the mutation, so the button tracks it and can't send a duplicate.
  const retryRef = useRef<(memberSpaceId: string) => void>(() => {});

  const run = useCallback(
    async (memberSpaceId: string) => {
      const fail = (message: string): never => {
        dispatch({ type: 'ERROR', payload: message });
        throw new Error(message);
      };

      if (!smartAccount) return fail('Please connect your wallet first');
      if (!personalSpaceId || !isRegistered) return fail('You need a registered personal space to do this');
      if (!validateSpaceId(spaceId) || !validateSpaceId(memberSpaceId)) {
        return fail('Invalid space ID format. Please try again.');
      }
      // No address means the space isn't a resolvable deployed DAO, and the write would be unexecutable.
      if (!space?.address) return fail('No space address found. Please try again.');

      const { encode, span, attributes } = ACTIONS[action];
      const { to, calldata } = encode({ authorSpaceId: personalSpaceId, spaceId, memberSpaceId });

      const result = await runEffectEither(
        tx({ to, data: calldata }).pipe(
          Effect.withSpan(span),
          Effect.annotateSpans({
            ...attributes,
            'space.type': 'DAO',
            'governance.member_fast_path_action': action,
            'governance.voting_mode': action === 'make_review_only' ? 'NONE' : 'SLOW',
          })
        )
      );

      Either.match(result, {
        onLeft: error => {
          console.error('Failed to change fast-path access', { action, spaceId, memberSpaceId }, error);
          dispatch({ type: 'ERROR', payload: String(error), retry: () => retryRef.current(memberSpaceId) });
          // Necessary to propagate error status to useMutation
          throw error;
        },
        onRight: () => {
          // A direct restriction changes the role now; proposals change it only once they pass.
          if (action === 'make_review_only') {
            void queryClient.invalidateQueries({ queryKey: [FAST_PATH_RESTRICTED_QUERY_KEY] });
          }
        },
      });
    },
    [action, dispatch, isRegistered, personalSpaceId, queryClient, smartAccount, space, spaceId, tx]
  );

  const { mutate, status } = useMutation({ mutationFn: run });
  retryRef.current = mutate;

  return { run: mutate, status };
}
