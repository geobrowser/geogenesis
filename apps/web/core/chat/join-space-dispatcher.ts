'use client';

import type { QueryClient } from '@tanstack/react-query';
import { useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import { type UIMessage, isToolUIPart } from 'ai';
import { Either } from 'effect';
import * as Effect from 'effect/Effect';

import { type SendSpaceTransaction, requestSpaceMembership } from '~/core/access/request-space-membership';
import { getSpaceAccessById, normalizeSpaceId } from '~/core/access/space-access';
import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { useSmartAccountTransaction } from '~/core/hooks/use-smart-account-transaction';
import { getSpace } from '~/core/io/queries';
import { fetchActiveMemberRequest } from '~/core/io/subgraph/fetch-proposed-members';
import { runEffectEither } from '~/core/telemetry/effect-runtime';
import { validateSpaceId } from '~/core/utils/utils';

import { enqueue } from './apply-queue';
import type { JoinSpaceInput, JoinSpaceOutput } from './nav-types';

const JOIN_SPACE_TOOL_PART = 'tool-joinSpace';

export type AddJoinSpaceResultFn = (args: { tool: string; toolCallId: string; output: unknown }) => void;

export type JoinSpaceDeps = {
  hasAccount: boolean;
  personalSpaceId: string | null;
  isRegistered: boolean;
  queryClient: QueryClient;
  tx: SendSpaceTransaction;
};

/**
 * Runs the same checks the explicit Join buttons go through (useRequestToBeMember
 * and ensureSpaceMembership), but reports each outcome instead of swallowing it —
 * the model has to tell the user which one happened, and "we did nothing" and
 * "you're already in" must not read the same.
 *
 * Deps are passed rather than read from hooks so the guard order is testable:
 * this signs a transaction, so nothing may reach `requestSpaceMembership` that
 * one of the guards above should have stopped.
 */
export async function resolveJoinSpace(deps: JoinSpaceDeps, spaceId: string): Promise<JoinSpaceOutput> {
  const { hasAccount, personalSpaceId, isRegistered, queryClient, tx } = deps;

  if (!validateSpaceId(spaceId)) return { ok: false, error: 'invalid_input', spaceId };
  if (!hasAccount) return { ok: false, error: 'not_signed_in', spaceId };
  if (!personalSpaceId || !isRegistered) return { ok: false, error: 'no_personal_space', spaceId };

  const normalizedSpaceId = normalizeSpaceId(spaceId);
  const normalizedPersonalSpaceId = normalizeSpaceId(personalSpaceId);

  const space = await queryClient
    .fetchQuery({
      queryKey: ['space', normalizedSpaceId],
      queryFn: () => Effect.runPromise(getSpace(normalizedSpaceId)),
      staleTime: 60_000,
    })
    .catch(() => null);
  if (!space) return { ok: false, error: 'space_not_found', spaceId };

  const spaceName = space.entity?.name ?? undefined;

  // Only DAO spaces have a membership proposal flow; someone else's personal
  // space can't be joined at all.
  if (space.type !== 'DAO') return { ok: false, error: 'not_joinable', spaceId, spaceName };

  const access = await runEffectEither(getSpaceAccessById(normalizedSpaceId, normalizedPersonalSpaceId));
  if (Either.isRight(access) && access.right.canEdit) {
    return { ok: false, error: 'already_member', spaceId, spaceName };
  }

  // A request whose vote has ended must not block a fresh one, or a rejected
  // user is wedged out of the space for good.
  const activeRequest = await fetchActiveMemberRequest(normalizedSpaceId, normalizedPersonalSpaceId).catch(() => null);
  if (activeRequest != null && !activeRequest.isVotingEnded) {
    return { ok: false, error: 'already_requested', spaceId, spaceName };
  }

  try {
    await requestSpaceMembership({
      spaceId: normalizedSpaceId,
      personalSpaceId: normalizedPersonalSpaceId,
      tx,
      queryClient,
      space: { name: spaceName, image: space.entity?.image ?? null },
    });
  } catch {
    // Already logged by requestSpaceMembership.
    return { ok: false, error: 'request_failed', spaceId, spaceName };
  }

  return { ok: true, status: 'requested', spaceId: normalizedSpaceId, spaceName };
}

export function useJoinSpaceDispatcher(
  messages: UIMessage[],
  addToolResultRef: React.RefObject<AddJoinSpaceResultFn | null>
) {
  const { smartAccount } = useSmartAccount();
  const { personalSpaceId, isRegistered } = usePersonalSpaceId();
  const queryClient = useQueryClient();
  const tx = useSmartAccountTransaction();

  const dispatchedRef = React.useRef(new Set<string>());
  const cancelledRef = React.useRef(false);

  React.useEffect(() => {
    cancelledRef.current = false;
    return () => {
      cancelledRef.current = true;
    };
  }, []);

  const deps = React.useMemo<JoinSpaceDeps>(
    () => ({ hasAccount: Boolean(smartAccount), personalSpaceId, isRegistered, queryClient, tx }),
    [smartAccount, personalSpaceId, isRegistered, queryClient, tx]
  );

  React.useEffect(() => {
    for (const message of messages) {
      if (message.role !== 'assistant') continue;
      for (const part of message.parts) {
        if (!isToolUIPart(part)) continue;
        if (part.type !== JOIN_SPACE_TOOL_PART) continue;
        if (part.state !== 'input-available') continue;
        if (dispatchedRef.current.has(part.toolCallId)) continue;
        dispatchedRef.current.add(part.toolCallId);

        const input = (part as { input?: unknown }).input as JoinSpaceInput | undefined;
        const toolCallId = part.toolCallId;
        const spaceId = typeof input?.spaceId === 'string' ? input.spaceId : '';

        // Serialized with the other client-dispatched tools: this signs through
        // the same smart account a publish uses, and must not race one.
        enqueue(async () => {
          if (cancelledRef.current) return;
          const output = spaceId
            ? await resolveJoinSpace(deps, spaceId)
            : ({ ok: false, error: 'invalid_input' } satisfies JoinSpaceOutput);
          if (cancelledRef.current) return;
          addToolResultRef.current?.({ tool: 'joinSpace', toolCallId, output });
        });
      }
    }
  }, [messages, addToolResultRef, deps]);
}
