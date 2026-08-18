import { act, renderHook } from '@testing-library/react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Relation } from '~/core/types';

import { CuratorApiError } from './api';
import type { BountyDetail } from './fetch-bounty-detail';
import { BOUNTY_ALLOCATED_PROPERTY_ID, INTERESTED_IN_BOUNTY_PROPERTY_ID } from './ontology';
import { useBountyAllocationActions, useBountyInterestActions } from './use-bounty-actions';
import type { BountyRoles } from './use-bounty-roles';

const mocks = vi.hoisted(() => ({
  reconcile: vi.fn(),
  makeProposal: vi.fn(),
  invalidateQueries: vi.fn(() => Promise.resolve()),
  setToast: vi.fn(),
  validate: vi.fn(),
  notify: vi.fn(),
}));

vi.mock('~/core/hooks/use-publish', () => ({ usePublish: () => ({ makeProposal: mocks.makeProposal }) }));
vi.mock('./reconcile-store', () => ({ reconcileDeletedRelations: mocks.reconcile }));
vi.mock('~/core/hooks/use-toast', () => ({ useToast: () => [null, mocks.setToast] }));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }) }));
vi.mock('./api', async importOriginal => {
  const actual = await importOriginal<typeof import('./api')>();
  return {
    ...actual,
    validateBountyAllocation: (...args: unknown[]) => mocks.validate(...args),
    notifyBountyAllocation: (...args: unknown[]) => mocks.notify(...args),
  };
});

const detail: BountyDetail = {
  bounty: {
    id: 'bounty-1',
    spaceId: 'dao-1',
    name: 'Bounty',
    description: null,
    budget: null,
    difficulty: null,
    difficultyId: null,
    status: null,
    statusId: null,
    deadline: null,
    skills: [],
    maintainers: [],
    allocatedIds: ['person-2'],
    interestedCount: 0,
    updatedAt: null,
  },
  interest: [],
  submissions: [],
  allocationRelations: [
    {
      id: 'alloc-1',
      type: { id: BOUNTY_ALLOCATED_PROPERTY_ID, name: null },
      fromEntity: { id: 'bounty-1', name: null },
      toEntity: { id: 'person-2', name: null, value: 'person-2' },
      spaceId: 'dao-1',
      entityId: 'e',
      renderableType: 'RELATION',
    } as Relation,
  ],
};

const roles: BountyRoles = {
  personId: 'person-1',
  personalSpaceId: 'personal-1',
  isSignedIn: true,
  isEditor: false,
  isMaintainer: false,
  isAllocated: false,
  isInterested: true,
  ownInterestRows: [
    { id: 'row-1', fromEntityId: 'person-1', spaceId: 'personal-1' },
    { id: 'row-2', fromEntityId: 'person-1', spaceId: 'personal-1' },
  ],
  isLoading: false,
};

function publishSucceeds() {
  mocks.makeProposal.mockImplementation(async ({ onSuccess }: { onSuccess: () => void }) => onSuccess());
}
function publishFails() {
  mocks.makeProposal.mockImplementation(async ({ onError }: { onError: () => void }) => onError());
}

beforeEach(() => {
  mocks.makeProposal.mockReset();
  mocks.invalidateQueries.mockClear();
  mocks.setToast.mockClear();
  mocks.validate.mockReset();
  mocks.notify.mockReset();
});

describe('useBountyInterestActions', () => {
  it('publishes a single interest relation into the personal space', async () => {
    publishSucceeds();
    const { result } = renderHook(() => useBountyInterestActions(detail, roles));
    let ok = false;
    await act(async () => {
      ok = await result.current.expressInterest();
    });
    expect(ok).toBe(true);
    const call = mocks.makeProposal.mock.calls[0][0];
    expect(call.spaceId).toBe('personal-1');
    expect(call.relations).toHaveLength(1);
    expect(call.relations[0]).toMatchObject({
      type: { id: INTERESTED_IN_BOUNTY_PROPERTY_ID },
      fromEntity: { id: 'person-1' },
      toEntity: { id: 'bounty-1' },
    });
    expect(mocks.invalidateQueries).toHaveBeenCalled();
  });

  it('cancels by deleting every own interest row and reports failure without invalidating', async () => {
    publishFails();
    const { result } = renderHook(() => useBountyInterestActions(detail, roles));
    let ok = true;
    await act(async () => {
      ok = await result.current.cancelInterest();
    });
    expect(ok).toBe(false);
    const call = mocks.makeProposal.mock.calls[0][0];
    expect(call.relations.map((r: Relation) => r.id)).toEqual(['row-1', 'row-2']);
    expect(call.relations.every((r: Relation) => r.isDeleted)).toBe(true);
    expect(mocks.invalidateQueries).not.toHaveBeenCalled();
    // A failed publish must not touch the store.
    expect(mocks.reconcile).not.toHaveBeenCalled();
    expect(result.current.error).toBe('Could not withdraw your interest.');
  });

  it('does nothing without a person or personal space', async () => {
    const { result } = renderHook(() => useBountyInterestActions(detail, { ...roles, personalSpaceId: null }));
    await act(async () => {
      expect(await result.current.expressInterest()).toBe(false);
    });
    expect(mocks.makeProposal).not.toHaveBeenCalled();
  });
});

describe('useBountyAllocationActions', () => {
  const bob = { id: 'person-3', name: 'Bob' };

  it('validates first and fails closed when the backend rejects or is unreachable', async () => {
    mocks.validate.mockResolvedValueOnce({ ok: false });
    const { result } = renderHook(() => useBountyAllocationActions(detail));
    await act(async () => {
      expect(await result.current.allocate(bob)).toMatchObject({ status: 'rejected' });
    });
    expect(mocks.makeProposal).not.toHaveBeenCalled();

    mocks.validate.mockRejectedValueOnce(new CuratorApiError('down', 503));
    await act(async () => {
      expect(await result.current.allocate(bob)).toMatchObject({ status: 'rejected', reason: 'down' });
    });
    expect(mocks.makeProposal).not.toHaveBeenCalled();
  });

  it('publishes the allocation into the DAO space and tolerates a failed notification', async () => {
    mocks.validate.mockResolvedValue({ ok: true });
    mocks.notify.mockRejectedValue(new Error('mail down'));
    publishSucceeds();
    const { result } = renderHook(() => useBountyAllocationActions(detail));
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.allocate(bob);
    });
    expect(outcome).toEqual({ status: 'allocated', notified: false, reason: 'curator service unreachable' });
    const call = mocks.makeProposal.mock.calls[0][0];
    expect(call.spaceId).toBe('dao-1');
    expect(call.relations[0]).toMatchObject({
      type: { id: BOUNTY_ALLOCATED_PROPERTY_ID },
      fromEntity: { id: 'bounty-1' },
      toEntity: { id: 'person-3' },
    });
    // The notification is keyed to the relation id we just minted.
    expect(mocks.notify.mock.calls[0][0]).toMatchObject({ allocatedRelationId: call.relations[0].id });
    expect(mocks.invalidateQueries).toHaveBeenCalled();
  });

  it('removes by tombstoning the existing allocation rows for that person', async () => {
    publishSucceeds();
    const { result } = renderHook(() => useBountyAllocationActions(detail));
    await act(async () => {
      expect(await result.current.remove({ id: 'person-2', name: null })).toBe(true);
    });
    const call = mocks.makeProposal.mock.calls[0][0];
    expect(call.relations).toEqual([expect.objectContaining({ id: 'alloc-1', isDeleted: true })]);
    // Successful tombstoning publishes reconcile the local store so the stale row stops rendering.
    expect(mocks.reconcile).toHaveBeenCalledWith(call.relations);
    // Nothing to remove → no publish.
    await act(async () => {
      expect(await result.current.remove({ id: 'nobody', name: null })).toBe(false);
    });
    expect(mocks.makeProposal).toHaveBeenCalledTimes(1);
  });

  it('surfaces the backend reason when the notification is declined', async () => {
    mocks.validate.mockResolvedValue({ ok: true });
    mocks.notify.mockResolvedValue({ sent: false, reason: 'email-not-found' });
    publishSucceeds();
    const { result } = renderHook(() => useBountyAllocationActions(detail));
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.allocate(bob);
    });
    expect(outcome).toEqual({ status: 'allocated', notified: false, reason: 'email-not-found' });
    expect(mocks.setToast).toHaveBeenLastCalledWith(expect.anything());
  });
});
