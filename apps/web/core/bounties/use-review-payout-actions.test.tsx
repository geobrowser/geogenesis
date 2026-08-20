import { act, renderHook } from '@testing-library/react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Relation, Value } from '~/core/types';

import type { BountyDetail } from './fetch-bounty-detail';
import type { GroupedSubmission } from './group-submissions';
import { PAYOUT_RECIPIENT_PROPERTY_ID, REVIEW_PASS_PROPERTY_ID } from './ontology';
import type { BountyRoles } from './use-bounty-roles';
import { useReviewPayoutActions } from './use-review-payout-actions';

const mocks = vi.hoisted(() => ({
  makeProposal: vi.fn(),
  invalidateQueries: vi.fn(() => Promise.resolve()),
  setToast: vi.fn(),
}));

vi.mock('~/core/hooks/use-publish', () => ({ usePublish: () => ({ makeProposal: mocks.makeProposal }) }));
vi.mock('~/core/hooks/use-toast', () => ({ useToast: () => [null, mocks.setToast] }));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }) }));

const detail: BountyDetail = {
  bounty: {
    id: 'bounty-1',
    spaceId: 'dao-1',
    name: 'Bounty',
    description: null,
    budget: 1000,
    difficulty: null,
    difficultyId: null,
    status: null,
    statusId: null,
    deadline: null,
    skills: [],
    maintainers: [],
    allocatedIds: [],
    interestedCount: 0,
    updatedAt: null,
    isFeatured: false,
    contributors: [],
  },
  interest: [],
  submissions: [],
  allocationRelations: [],
};

const roles: BountyRoles = {
  personId: 'editor-person',
  personalSpaceId: 'editor-space',
  isSignedIn: true,
  isEditor: true,
  isMaintainer: false,
  isAllocated: false,
  isInterested: false,
  ownInterestRows: [],
  isLoading: false,
};

const submission: GroupedSubmission = {
  submissionKey: 'bounty-1:alice:p1',
  creatorEntityId: 'alice',
  creatorName: 'Alice',
  firstProposalId: 'p1',
  proposalIds: ['p1', 'p2'],
  lastActiveAt: new Date('2026-08-01T00:00:00.000Z'),
  status: 'in-progress',
  payoutId: undefined,
  payoutAmount: undefined,
  proposals: [],
  canReviewAndPayout: true,
};

const stars = { completeness: 1, accuracy: 0.8, skill: 0.8, effort: 1 };

beforeEach(() => {
  for (const fn of Object.values(mocks)) if ('mockReset' in fn) fn.mockReset();
  mocks.invalidateQueries.mockResolvedValue(undefined);
  mocks.makeProposal.mockImplementation(async ({ onSuccess }: { onSuccess: () => void }) => onSuccess());
});

function proposalCall(index: number) {
  return mocks.makeProposal.mock.calls[index][0] as {
    spaceId: string;
    values: Value[];
    relations: Relation[];
    name: string;
  };
}

describe('useReviewPayoutActions', () => {
  it('publishes the review into the reviewer space, then the payout into the DAO space', async () => {
    const { result } = renderHook(() => useReviewPayoutActions(detail, roles));
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.submitReview({
        submission,
        stars,
        pass: true,
        comment: 'nice',
        payoutAmount: 200,
      });
    });
    expect(outcome).toEqual({ status: 'saved-and-paid' });
    expect(mocks.makeProposal).toHaveBeenCalledTimes(2);

    const review = proposalCall(0);
    expect(review.spaceId).toBe('editor-space');
    expect(review.values.some(v => v.property.id === REVIEW_PASS_PROPERTY_ID && v.value === 'true')).toBe(true);

    const payout = proposalCall(1);
    expect(payout.spaceId).toBe('dao-1');
    expect(payout.relations.some(r => r.type.id === PAYOUT_RECIPIENT_PROPERTY_ID)).toBe(true);
  });

  it('saves a passing review without a payout when no amount is entered', async () => {
    const { result } = renderHook(() => useReviewPayoutActions(detail, roles));
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.submitReview({
        submission,
        stars,
        pass: true,
        comment: '',
        payoutAmount: null,
      });
    });
    expect(outcome).toEqual({ status: 'saved' });
    expect(mocks.makeProposal).toHaveBeenCalledTimes(1);
  });

  it('a failing review is the rejection: one publish, no payout', async () => {
    const { result } = renderHook(() => useReviewPayoutActions(detail, roles));
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.submitReview({
        submission,
        stars,
        pass: false,
        comment: 'redo',
        payoutAmount: 200,
      });
    });
    expect(outcome).toEqual({ status: 'saved' });
    expect(mocks.makeProposal).toHaveBeenCalledTimes(1);
    expect(proposalCall(0).values.some(v => v.property.id === REVIEW_PASS_PROPERTY_ID && v.value === 'false')).toBe(
      true
    );
  });

  it('reports a failed review publish and never attempts the payout', async () => {
    mocks.makeProposal.mockImplementation(async ({ onError }: { onError: () => void }) => onError());
    const { result } = renderHook(() => useReviewPayoutActions(detail, roles));
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.submitReview({
        submission,
        stars,
        pass: true,
        comment: '',
        payoutAmount: 200,
      });
    });
    expect(outcome).toEqual({ status: 'failed', reason: 'Review publish failed' });
    expect(mocks.makeProposal).toHaveBeenCalledTimes(1);
  });

  it('reports a failed payout publish after a saved review', async () => {
    mocks.makeProposal
      .mockImplementationOnce(async ({ onSuccess }: { onSuccess: () => void }) => onSuccess())
      .mockImplementationOnce(async ({ onError }: { onError: () => void }) => onError());
    const { result } = renderHook(() => useReviewPayoutActions(detail, roles));
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.submitReview({
        submission,
        stars,
        pass: true,
        comment: '',
        payoutAmount: 200,
      });
    });
    expect(outcome).toEqual({ status: 'failed', reason: 'Review saved, but the payout could not be published' });
  });
});
