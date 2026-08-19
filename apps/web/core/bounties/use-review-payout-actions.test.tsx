import { act, renderHook } from '@testing-library/react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Relation, Value } from '~/core/types';

import { CuratorApiError } from './api';
import type { BountyDetail } from './fetch-bounty-detail';
import type { GroupedSubmission } from './group-submissions';
import { PAYOUT_RECIPIENT_PROPERTY_ID, REVIEW_PASS_PROPERTY_ID } from './ontology';
import type { BountyRoles } from './use-bounty-roles';
import { useReviewPayoutActions } from './use-review-payout-actions';

const mocks = vi.hoisted(() => ({
  makeProposal: vi.fn(),
  invalidateQueries: vi.fn(() => Promise.resolve()),
  setToast: vi.fn(),
  createPayoutCredit: vi.fn(),
  markSubmissionPaid: vi.fn(),
  rejectSubmission: vi.fn(),
  requestSubmissionReview: vi.fn(),
}));

vi.mock('~/core/hooks/use-publish', () => ({ usePublish: () => ({ makeProposal: mocks.makeProposal }) }));
vi.mock('~/core/hooks/use-toast', () => ({ useToast: () => [null, mocks.setToast] }));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }) }));
vi.mock('./api', async importOriginal => {
  const actual = await importOriginal<typeof import('./api')>();
  return {
    ...actual,
    createPayoutCredit: (...a: unknown[]) => mocks.createPayoutCredit(...a),
    markSubmissionPaid: (...a: unknown[]) => mocks.markSubmissionPaid(...a),
    rejectSubmission: (...a: unknown[]) => mocks.rejectSubmission(...a),
    requestSubmissionReview: (...a: unknown[]) => mocks.requestSubmissionReview(...a),
  };
});

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

const segmentInput = {
  submissionKey: 'bounty-1:alice:p1',
  creatorEntityId: 'alice',
  firstProposalId: 'p1',
  proposalIds: ['p1', 'p2'],
  lastActiveAt: new Date('2026-08-01T00:00:00.000Z'),
};

const submission: GroupedSubmission = {
  ...segmentInput,
  creatorName: 'Alice',
  status: 'ready-for-review',
  payoutId: undefined,
  payoutAmount: undefined,
  needsPayoutRetry: false,
  retrySubmissionLifecycleInput: segmentInput,
  segmentInput,
  proposals: [],
  canRequestReview: false,
  canReviewAndPayout: true,
};

const stars = { completeness: 1, accuracy: 0.8, skill: 0.8, effort: 1 };

beforeEach(() => {
  for (const fn of Object.values(mocks)) if ('mockReset' in fn) fn.mockReset();
  mocks.invalidateQueries.mockResolvedValue(undefined);
  mocks.makeProposal.mockImplementation(async ({ onSuccess }: { onSuccess: () => void }) => onSuccess());
  mocks.createPayoutCredit.mockResolvedValue({ success: true, newBalance: 800, newTotalPaidOut: 200 });
  mocks.markSubmissionPaid.mockResolvedValue({ success: true });
  mocks.rejectSubmission.mockResolvedValue({ success: true });
  mocks.requestSubmissionReview.mockResolvedValue({ success: true });
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
  it('runs the full happy path: review → payout → credit → mark paid', async () => {
    const { result } = renderHook(() => useReviewPayoutActions(detail, roles));
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.submitReview({
        submission,
        stars,
        pass: true,
        comment: 'Great',
        payoutAmount: 200,
      });
    });
    expect(outcome).toEqual({ status: 'saved-and-paid' });

    // Review goes to the reviewer's personal space; payout to the DAO space.
    expect(proposalCall(0).spaceId).toBe('editor-space');
    expect(proposalCall(0).values.some(v => v.property.id === REVIEW_PASS_PROPERTY_ID && v.value === 'true')).toBe(
      true
    );
    expect(proposalCall(1).spaceId).toBe('dao-1');
    const outer = proposalCall(1).relations.find(r => r.type.id === PAYOUT_RECIPIENT_PROPERTY_ID)!;
    expect(outer.toEntity.id).toBe('alice');

    // The credit is keyed to the outer relation id, and the lifecycle payload is the segment.
    expect(mocks.createPayoutCredit.mock.calls[0][0]).toMatchObject({
      spaceId: 'dao-1',
      amount: 200,
      bountyId: 'bounty-1',
      payoutEntityId: outer.id,
      recipientEntityId: 'alice',
    });
    expect(mocks.markSubmissionPaid.mock.calls[0][0]).toMatchObject({
      spaceId: 'dao-1',
      bountyId: 'bounty-1',
      submissionKey: 'bounty-1:alice:p1',
      proposalIds: ['p1', 'p2'],
      lastActiveAt: '2026-08-01T00:00:00.000Z',
    });
    expect(result.current.pendingCredit).toBeNull();
  });

  it('holds a pending credit when the points credit fails, then retries and marks paid', async () => {
    mocks.createPayoutCredit.mockRejectedValueOnce(new CuratorApiError('down', 503));
    const { result } = renderHook(() => useReviewPayoutActions(detail, roles));
    let outcome: { status: string } = { status: '' };
    await act(async () => {
      outcome = (await result.current.submitReview({
        submission,
        stars,
        pass: true,
        comment: '',
        payoutAmount: 200,
      })) as {
        status: string;
      };
    });
    expect(outcome.status).toBe('credit-pending');
    expect(result.current.pendingCredit).toMatchObject({ amount: 200, recipientEntityId: 'alice' });
    expect(mocks.markSubmissionPaid).not.toHaveBeenCalled();

    // Retry re-POSTs the SAME payoutEntityId (idempotency handle) and finishes the lifecycle.
    const firstAttempt = mocks.createPayoutCredit.mock.calls[0][0];
    await act(async () => {
      expect(await result.current.retryPayoutCredit()).toBe(true);
    });
    expect(mocks.createPayoutCredit.mock.calls[1][0].payoutEntityId).toBe(firstAttempt.payoutEntityId);
    expect(mocks.markSubmissionPaid).toHaveBeenCalledTimes(1);
    expect(result.current.pendingCredit).toBeNull();
  });

  it('reports lifecycle-pending when the credit lands but marking paid fails', async () => {
    mocks.markSubmissionPaid.mockRejectedValueOnce(new Error('down'));
    const { result } = renderHook(() => useReviewPayoutActions(detail, roles));
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.submitReview({ submission, stars, pass: true, comment: '', payoutAmount: 200 });
    });
    expect(outcome).toEqual({ status: 'lifecycle-pending' });
    // The recovery path is the row's Retry (needsPayoutRetry) → retryMarkPaid.
    await act(async () => {
      expect(await result.current.retryMarkPaid(segmentInput)).toBe(true);
    });
  });

  it('a failing review rejects the submission and never touches payout', async () => {
    const { result } = renderHook(() => useReviewPayoutActions(detail, roles));
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.submitReview({
        submission,
        stars,
        pass: false,
        comment: 'Incomplete',
        payoutAmount: null,
      });
    });
    expect(outcome).toEqual({ status: 'saved' });
    expect(mocks.makeProposal).toHaveBeenCalledTimes(1);
    expect(mocks.rejectSubmission).toHaveBeenCalledTimes(1);
    expect(mocks.createPayoutCredit).not.toHaveBeenCalled();
  });

  it('does not publish a payout when the review publish itself fails', async () => {
    mocks.makeProposal.mockImplementationOnce(async ({ onError }: { onError: () => void }) => onError());
    const { result } = renderHook(() => useReviewPayoutActions(detail, roles));
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.submitReview({ submission, stars, pass: true, comment: '', payoutAmount: 200 });
    });
    expect(outcome).toMatchObject({ status: 'failed' });
    expect(mocks.makeProposal).toHaveBeenCalledTimes(1);
    expect(mocks.createPayoutCredit).not.toHaveBeenCalled();
  });

  it('request review calls the lifecycle endpoint with the segment and tolerates failure with a toast', async () => {
    const { result } = renderHook(() => useReviewPayoutActions(detail, roles));
    await act(async () => {
      expect(await result.current.requestReview(segmentInput)).toBe(true);
    });
    expect(mocks.requestSubmissionReview.mock.calls[0][0]).toMatchObject({ submissionKey: 'bounty-1:alice:p1' });
    mocks.requestSubmissionReview.mockRejectedValueOnce(new CuratorApiError('nope', 400));
    await act(async () => {
      expect(await result.current.requestReview(segmentInput)).toBe(false);
    });
    expect(mocks.setToast).toHaveBeenLastCalledWith(expect.anything());
  });
});
