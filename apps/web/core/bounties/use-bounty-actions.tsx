'use client';

import { useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import { usePublish } from '~/core/hooks/use-publish';
import { useToast } from '~/core/hooks/use-toast';

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
 * Curator-side interest actions. Interest is a knowledge-graph relation from
 * the curator's personal-space system entity to the bounty, authored into the
 * curator's own personal space — a direct publish with no governance.
 */
export function useBountyInterestActions(detail: BountyDetail | null | undefined, roles: BountyRoles) {
  const { makeProposal } = usePublish();
  const queryClient = useQueryClient();
  const [state, setState] = React.useState<ActionState>({ pending: false, error: null });

  const invalidate = React.useCallback(
    () => queryClient.invalidateQueries({ queryKey: bountyQueryKeys.all }),
    [queryClient]
  );

  const expressInterest = React.useCallback(async () => {
    if (!detail || !roles.personalSpaceId) return false;
    setState({ pending: true, error: null });
    const { relations } = buildExpressInterestOps({
      personalSpaceId: roles.personalSpaceId,
      bounty: { id: detail.bounty.id, name: detail.bounty.name },
      bountySpaceId: detail.bounty.spaceId,
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
  }, [detail, invalidate, makeProposal, roles.personalSpaceId]);

  const cancelInterest = React.useCallback(async () => {
    if (!detail || !roles.personalSpaceId || roles.ownInterestRows.length === 0) return false;
    setState({ pending: true, error: null });
    const { relations } = buildCancelInterestOps({
      personalSpaceId: roles.personalSpaceId,
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
  }, [detail, invalidate, makeProposal, roles.ownInterestRows, roles.personalSpaceId]);

  return { ...state, expressInterest, cancelInterest };
}

export type CuratorTarget = {
  /** The curator's personal space id — its system entity is the allocation target. */
  spaceId: string;
  name: string | null;
};

/**
 * Editor-side allocation. An allocation is just an `Allocated` relation from
 * the bounty to the curator's personal-space system entity, published into the
 * bounty's DAO space (FAST path for editors). No external service is involved;
 * the max-contributors limit is enforced by the UI before offering the action.
 */
export function useBountyAllocationActions(detail: BountyDetail | null | undefined) {
  const { makeProposal } = usePublish();
  const queryClient = useQueryClient();
  const [, setToast] = useToast();
  const [pendingTargetId, setPendingTargetId] = React.useState<string | null>(null);

  const invalidate = React.useCallback(
    () => queryClient.invalidateQueries({ queryKey: bountyQueryKeys.all }),
    [queryClient]
  );

  const allocate = React.useCallback(
    async (curator: CuratorTarget): Promise<boolean> => {
      if (!detail) return false;
      const { bounty } = detail;
      setPendingTargetId(curator.spaceId);
      try {
        const { relations } = buildAllocateOps({
          daoSpaceId: bounty.spaceId,
          bounty: { id: bounty.id, name: bounty.name },
          curatorSpaceId: curator.spaceId,
          curatorName: curator.name,
        });
        const ok = await publishOnce(makeProposal, {
          values: [],
          relations,
          spaceId: bounty.spaceId,
          name: `Allocate bounty: ${bounty.name}`,
        });
        if (ok) {
          await invalidate();
          setToast(<>Allocated {curator.name ?? 'the curator'}.</>);
        }
        return ok;
      } finally {
        setPendingTargetId(null);
      }
    },
    [detail, invalidate, makeProposal, setToast]
  );

  const remove = React.useCallback(
    async (targetId: string): Promise<boolean> => {
      if (!detail) return false;
      const { bounty } = detail;
      const { relations } = buildRemoveAllocationOps({
        daoSpaceId: bounty.spaceId,
        bounty: { id: bounty.id, name: bounty.name },
        targetId,
        existingRelations: detail.allocationRelations,
      });
      if (relations.length === 0) return false;
      setPendingTargetId(targetId);
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
        setPendingTargetId(null);
      }
    },
    [detail, invalidate, makeProposal]
  );

  return { allocate, remove, pendingTargetId };
}
