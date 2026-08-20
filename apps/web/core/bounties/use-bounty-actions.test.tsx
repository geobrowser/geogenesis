import { act, renderHook } from '@testing-library/react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Relation } from '~/core/types';

import type { BountyDetail } from './fetch-bounty-detail';
import { BOUNTY_ALLOCATED_PROPERTY_ID, INTERESTED_IN_BOUNTY_PROPERTY_ID } from './ontology';
import { useBountyAllocationActions, useBountyInterestActions } from './use-bounty-actions';
import type { BountyRoles } from './use-bounty-roles';

const mocks = vi.hoisted(() => ({
  reconcile: vi.fn(),
  makeProposal: vi.fn(),
  invalidateQueries: vi.fn(() => Promise.resolve()),
  setToast: vi.fn(),
}));

vi.mock('~/core/hooks/use-publish', () => ({ usePublish: () => ({ makeProposal: mocks.makeProposal }) }));
vi.mock('./reconcile-store', () => ({ reconcileDeletedRelations: mocks.reconcile }));
vi.mock('~/core/hooks/use-toast', () => ({ useToast: () => [null, mocks.setToast] }));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }) }));

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
    isFeatured: false,
    contributors: [],
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
    { id: 'row-1', fromEntityId: 'personal-1', spaceId: 'personal-1' },
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
  mocks.reconcile.mockClear();
});

describe('useBountyInterestActions', () => {
  it('publishes a single interest relation from the personal-space entity, with the bounty space as toSpaceId', async () => {
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
      fromEntity: { id: 'personal-1' },
      toEntity: { id: 'bounty-1' },
      toSpaceId: 'dao-1',
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

  it('does nothing without a personal space', async () => {
    const { result } = renderHook(() => useBountyInterestActions(detail, { ...roles, personalSpaceId: null }));
    await act(async () => {
      expect(await result.current.expressInterest()).toBe(false);
    });
    expect(mocks.makeProposal).not.toHaveBeenCalled();
  });
});

describe('useBountyAllocationActions', () => {
  const bob = { spaceId: 'personal-3', name: 'Bob' };

  it('publishes the allocation to the personal-space entity into the DAO space', async () => {
    publishSucceeds();
    const { result } = renderHook(() => useBountyAllocationActions(detail));
    let ok = false;
    await act(async () => {
      ok = await result.current.allocate(bob);
    });
    expect(ok).toBe(true);
    const call = mocks.makeProposal.mock.calls[0][0];
    expect(call.spaceId).toBe('dao-1');
    expect(call.relations[0]).toMatchObject({
      type: { id: BOUNTY_ALLOCATED_PROPERTY_ID },
      fromEntity: { id: 'bounty-1' },
      toEntity: { id: 'personal-3', name: 'Bob' },
      toSpaceId: 'personal-3',
    });
    expect(mocks.invalidateQueries).toHaveBeenCalled();
    expect(mocks.setToast).toHaveBeenCalled();
  });

  it('reports a failed allocation publish without invalidating or toasting', async () => {
    publishFails();
    const { result } = renderHook(() => useBountyAllocationActions(detail));
    await act(async () => {
      expect(await result.current.allocate(bob)).toBe(false);
    });
    expect(mocks.invalidateQueries).not.toHaveBeenCalled();
    expect(mocks.setToast).not.toHaveBeenCalled();
  });

  it('removes by tombstoning the existing allocation rows for that target', async () => {
    publishSucceeds();
    const { result } = renderHook(() => useBountyAllocationActions(detail));
    await act(async () => {
      expect(await result.current.remove('person-2')).toBe(true);
    });
    const call = mocks.makeProposal.mock.calls[0][0];
    expect(call.relations).toEqual([expect.objectContaining({ id: 'alloc-1', isDeleted: true })]);
    // Successful tombstoning publishes reconcile the local store so the stale row stops rendering.
    expect(mocks.reconcile).toHaveBeenCalledWith(call.relations);
    // Nothing to remove → no publish.
    await act(async () => {
      expect(await result.current.remove('nobody')).toBe(false);
    });
    expect(mocks.makeProposal).toHaveBeenCalledTimes(1);
  });
});
