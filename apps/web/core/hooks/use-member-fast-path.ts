'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useCallback } from 'react';

import { Effect, Either } from 'effect';

import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { useSmartAccountTransaction } from '~/core/hooks/use-smart-account-transaction';
import { geo } from '~/core/sdk/geo-client';
import { SPACE_REGISTRY_ADDRESS_HEX } from '~/core/sdk/geo-network';
import { useStatusBar } from '~/core/state/status-bar-store';
import { runEffectEither } from '~/core/telemetry/effect-runtime';
import {
  encodeAddMemberWithFastPathProposal,
  encodeRestrictMemberFastPath,
  encodeUnrestrictMemberProposal,
} from '~/core/utils/contracts/fast-path-calldata';
import { validateSpaceId } from '~/core/utils/utils';

export type MemberFastPathAction =
  /** SLOW proposal: lift the person's restriction. */
  | 'give_fast_path'
  /** Immediate editor action: put the person on the review path only. */
  | 'make_review_only'
  /** SLOW proposal: add someone back and lift the restriction they kept when they left. */
  | 'add_back_with_fast_path'
  /** SLOW proposal: add someone back, leaving any restriction they hold in place. */
  | 'add_back_review_only';

const SPAN_NAMES: Record<MemberFastPathAction, string> = {
  give_fast_path: 'web.write.createProposal.unrestrictSpace',
  make_review_only: 'web.write.restrictSpaceFastPath',
  add_back_with_fast_path: 'web.write.createProposal.addMemberWithFastPath',
  add_back_review_only: 'web.write.createProposal.addMember',
};

function buildCalldata(action: MemberFastPathAction, authorSpaceId: string, spaceId: string, memberSpaceId: string) {
  const params = { registry: SPACE_REGISTRY_ADDRESS_HEX, authorSpaceId, spaceId, memberSpaceId };
  switch (action) {
    case 'give_fast_path':
      return encodeUnrestrictMemberProposal(params);
    case 'make_review_only':
      return encodeRestrictMemberFastPath(params);
    case 'add_back_with_fast_path':
      return encodeAddMemberWithFastPathProposal(params);
    case 'add_back_review_only':
      return geo.daoSpaces.proposeAddMember({
        authorSpaceId,
        spaceId,
        newMemberSpaceId: memberSpaceId,
        votingMode: 'SLOW',
      });
  }
}

/**
 * Changes one person's fast-path access in a DAO space, for editors.
 *
 * Only `make_review_only` takes effect immediately. Lifting a restriction is a governance action
 * on the DAO contract, so the other three create a review-path proposal that editors vote on.
 */
export function useMemberFastPath({ spaceId, action }: { spaceId: string; action: MemberFastPathAction }) {
  const { dispatch } = useStatusBar();
  const queryClient = useQueryClient();
  const { smartAccount } = useSmartAccount();
  const { personalSpaceId, isRegistered } = usePersonalSpaceId();
  const tx = useSmartAccountTransaction();

  const run = useCallback(
    async (memberSpaceId: string) => {
      const fail = (message: string): never => {
        dispatch({ type: 'ERROR', payload: message });
        throw new Error(message);
      };

      if (!smartAccount) fail('Please connect your wallet first');
      if (!personalSpaceId || !isRegistered) fail('You need a registered personal space to do this');
      if (!validateSpaceId(spaceId) || !validateSpaceId(memberSpaceId)) fail('Invalid space ID. Please try again.');

      const { to, calldata } = buildCalldata(action, personalSpaceId!, spaceId, memberSpaceId);

      const result = await runEffectEither(
        tx({ to, data: calldata }).pipe(
          Effect.withSpan(SPAN_NAMES[action]),
          Effect.annotateSpans({
            'space.type': 'DAO',
            'governance.member_fast_path_action': action,
            'governance.voting_mode': action === 'make_review_only' ? 'NONE' : 'SLOW',
          })
        )
      );

      Either.match(result, {
        onLeft: error => {
          console.error('Failed to change fast-path access', { action, spaceId, memberSpaceId }, error);
          dispatch({ type: 'ERROR', payload: String(error), retry: () => run(memberSpaceId) });
          throw error;
        },
        onRight: () => {
          // The restriction read is cached for the session; a direct restriction changes it now.
          if (action === 'make_review_only') {
            void queryClient.invalidateQueries({ queryKey: ['fast-path-restricted'] });
          }
        },
      });
    },
    [action, dispatch, isRegistered, personalSpaceId, queryClient, smartAccount, spaceId, tx]
  );

  const { mutate, status } = useMutation({ mutationFn: run });

  return { run: mutate, status };
}
