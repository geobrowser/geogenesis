'use client';

import { useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import { usePublish } from '~/core/hooks/use-publish';
import { useToast } from '~/core/hooks/use-toast';

import { CuratorApiError, notifyBountyAllocation, validateBountyAllocation } from './api';
import type { EntityPick } from './bounty-ops';
import type { BountyDetail } from './fetch-bounty-detail';
import {
  buildAllocateOps,
  buildCancelInterestOps,
  buildExpressInterestOps,
  buildRemoveAllocationOps,
} from './interest-ops';
import { reconcileDeletedRelations } from './reconcile-store';
import { bountyQueryKeys } from './use-bounties';
import type { BountyRoles } from './use-bounty-roles';

/**
 * Wraps `makeProposal` (callback-style) as a promise resolving to whether the
 * publish succeeded. `usePublish` already reports failures through the status
 * bar, so callers only need the boolean.
 */
function publishOnce(
  makeProposal: ReturnType<typeof usePublish>['makeProposal'],
  args: Omit<Parameters<typeof makeProposal>[0], 'onSuccess' | 'onError'>
): Promise<boolean> {
  return new Promise(resolve => {
    void makeProposal({ ...args, onSuccess: () => resolve(true), onError: () => resolve(false) });
  });
}

type ActionState = { pending: boolean; error: string | null };

/**
 * Curator-side interest actions. Interest is authored into the curator's own
 * personal space, so both are direct publishes with no governance.
 */
export function useBountyInterestActions(detail: BountyDetail | null | undefined, roles: BountyRoles) {
  const { makeProposal } = usePublish();
  const queryClient = useQueryClient();
  const [state, setState] = React.useState<ActionState>({ pending: false, error: null });

  const invalidate = React.useCallback(
    () => queryClient.invalidateQueries({ queryKey: bountyQueryKeys.all }),
    [queryClient]
  );

  const person = React.useMemo<EntityPick | null>(
    () => (roles.personId ? { id: roles.personId, name: null } : null),
    [roles.personId]
  );

  const expressInterest = React.useCallback(async () => {
    if (!detail || !person || !roles.personalSpaceId) return false;
    setState({ pending: true, error: null });
    const { relations } = buildExpressInterestOps({
      personalSpaceId: roles.personalSpaceId,
      person,
      bounty: { id: detail.bounty.id, name: detail.bounty.name },
    });
    const ok = await publishOnce(makeProposal, {
      values: [],
      relations,
      spaceId: roles.personalSpaceId,
      name: `Interested in bounty: ${detail.bounty.name}`,
    });
    if (ok) await invalidate();
    setState({ pending: false, error: ok ? null : 'Could not record your interest.' });
    return ok;
  }, [detail, invalidate, makeProposal, person, roles.personalSpaceId]);

  const cancelInterest = React.useCallback(async () => {
    if (!detail || !person || !roles.personalSpaceId || roles.ownInterestRows.length === 0) return false;
    setState({ pending: true, error: null });
    const { relations } = buildCancelInterestOps({
      personalSpaceId: roles.personalSpaceId,
      person,
      bounty: { id: detail.bounty.id, name: detail.bounty.name },
      ownInterestRows: roles.ownInterestRows,
    });
    const ok = await publishOnce(makeProposal, {
      values: [],
      relations,
      spaceId: roles.personalSpaceId,
      name: `Withdraw interest in bounty: ${detail.bounty.name}`,
    });
    if (ok) {
      reconcileDeletedRelations(relations);
      await invalidate();
    }
    setState({ pending: false, error: ok ? null : 'Could not withdraw your interest.' });
    return ok;
  }, [detail, invalidate, makeProposal, person, roles.ownInterestRows, roles.personalSpaceId]);

  return { ...state, expressInterest, cancelInterest };
}

export type AllocationResult =
  | { status: 'allocated'; notified: boolean; reason?: string | null }
  | { status: 'rejected'; reason: string }
  | { status: 'failed'; reason: string };

/** curator-backend's `reason` codes for an unsent allocation email, in plain words. */
export function describeNotifyReason(reason: string): string {
  switch (reason) {
    case 'email-not-configured':
      return 'the curator service has no email provider configured';
    case 'email-not-found':
      return 'no email is known for this curator';
    case 'already-sent':
      return 'they were already notified for this allocation';
    case 'already-processing':
      return 'a notification is already in flight';
    case 'email-send-failed':
      return 'the email provider rejected the message';
    default:
      return reason;
  }
}

/**
 * Editor-side allocation, three steps mirroring curator-app:
 * 1. curator-backend validate — FAIL CLOSED (editor, duplicate, max-contributors);
 * 2. publish the Allocated relation into the DAO space (FAST path);
 * 3. curator-backend notification email — failure tolerated, the allocation stands.
 */
export function useBountyAllocationActions(detail: BountyDetail | null | undefined) {
  const { makeProposal } = usePublish();
  const queryClient = useQueryClient();
  const [, setToast] = useToast();
  const [pendingPersonId, setPendingPersonId] = React.useState<string | null>(null);

  const invalidate = React.useCallback(
    () => queryClient.invalidateQueries({ queryKey: bountyQueryKeys.all }),
    [queryClient]
  );

  const allocate = React.useCallback(
    async (person: EntityPick): Promise<AllocationResult> => {
      if (!detail) return { status: 'failed', reason: 'Bounty not loaded' };
      const { bounty } = detail;
      setPendingPersonId(person.id);
      try {
        try {
          const validation = await validateBountyAllocation({
            spaceId: bounty.spaceId,
            bountyId: bounty.id,
            allocatedPersonId: person.id,
          });
          if (!validation.ok) {
            setToast(<>Allocation was rejected by the curator service.</>);
            return { status: 'rejected', reason: 'Validation failed' };
          }
        } catch (error) {
          const reason = error instanceof CuratorApiError ? error.message : 'Curator service unavailable';
          setToast(<>Couldn&apos;t validate this allocation: {reason}</>);
          return { status: 'rejected', reason };
        }

        const { relationId, relations } = buildAllocateOps({
          daoSpaceId: bounty.spaceId,
          bounty: { id: bounty.id, name: bounty.name },
          person,
        });
        const ok = await publishOnce(makeProposal, {
          values: [],
          relations,
          spaceId: bounty.spaceId,
          name: `Allocate bounty: ${bounty.name}`,
        });
        if (!ok) return { status: 'failed', reason: 'Publish failed' };

        let notified = false;
        let notifyReason: string | null = null;
        try {
          const result = await notifyBountyAllocation({
            spaceId: bounty.spaceId,
            bountyId: bounty.id,
            allocatedPersonId: person.id,
            allocatedRelationId: relationId,
          });
          notified = result.sent;
          notifyReason = result.reason;
        } catch (error) {
          notified = false;
          notifyReason = error instanceof CuratorApiError ? error.message : 'curator service unreachable';
        }
        if (!notified) {
          console.warn('[bounties] allocation notification not sent', {
            bountyId: bounty.id,
            allocatedPersonId: person.id,
            reason: notifyReason,
          });
        }
        await invalidate();
        setToast(
          notified ? (
            <>Allocated and notified {person.name ?? 'the curator'}.</>
          ) : (
            <>
              Allocated {person.name ?? 'the curator'}. The notification email was not sent
              {notifyReason ? ` (${describeNotifyReason(notifyReason)})` : ''}.
            </>
          )
        );
        return { status: 'allocated', notified, reason: notifyReason };
      } finally {
        setPendingPersonId(null);
      }
    },
    [detail, invalidate, makeProposal, setToast]
  );

  const remove = React.useCallback(
    async (person: EntityPick): Promise<boolean> => {
      if (!detail) return false;
      const { bounty } = detail;
      const { relations } = buildRemoveAllocationOps({
        daoSpaceId: bounty.spaceId,
        bounty: { id: bounty.id, name: bounty.name },
        person,
        existingRelations: detail.allocationRelations,
      });
      if (relations.length === 0) return false;
      setPendingPersonId(person.id);
      try {
        const ok = await publishOnce(makeProposal, {
          values: [],
          relations,
          spaceId: bounty.spaceId,
          name: `Remove allocation: ${bounty.name}`,
        });
        if (ok) {
          reconcileDeletedRelations(relations);
          await invalidate();
        }
        return ok;
      } finally {
        setPendingPersonId(null);
      }
    },
    [detail, invalidate, makeProposal]
  );

  return { allocate, remove, pendingPersonId };
}
