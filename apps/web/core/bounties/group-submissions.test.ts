import { describe, expect, it } from 'vitest';

import type { SubmissionLifecycleRecord } from './api';
import { type PayoutItem, type SubmissionItem, buildSubmissionKey, groupSubmissions } from './group-submissions';

// Ported from curator-app's group-submissions.test.ts — the semantics must stay identical across apps.

const creatorId = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const bountyId = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const proposalOneId = 'cccccccccccccccccccccccccccccccc';
const proposalTwoId = 'dddddddddddddddddddddddddddddddd';
const spaceId = 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';

const submission = (overrides: Partial<SubmissionItem>): SubmissionItem => ({
  id: 'submission-relation-1',
  name: 'Proposal',
  creatorName: 'Curator One',
  creatorEntityId: creatorId,
  entityId: proposalOneId,
  spaceId,
  createdAt: new Date('2026-04-04T10:00:00.000Z'),
  ...overrides,
});

const payout = (overrides: Partial<PayoutItem> = {}): PayoutItem => ({
  id: 'payout-1',
  payoutEntityId: 'payout-entity-1',
  recipientEntityId: creatorId,
  recipientName: 'Curator One',
  amount: 120,
  proposalIds: [proposalOneId],
  createdAt: new Date('2026-04-05T10:00:00.000Z'),
  ...overrides,
});

const record = (overrides: Partial<SubmissionLifecycleRecord>): SubmissionLifecycleRecord => ({
  submissionKey: buildSubmissionKey(bountyId, creatorId, proposalOneId),
  creatorEntityId: creatorId,
  firstProposalId: proposalOneId,
  proposalIds: [proposalOneId],
  status: 'ready-for-review',
  lastActiveAt: '2026-04-04T10:00:00.000Z',
  requestedAt: '2026-04-04T10:00:00.000Z',
  reviewedAt: null,
  reviewedBySpaceId: null,
  ...overrides,
});

describe('groupSubmissions', () => {
  it('keeps submission status independent from proposal status and allows request review while in progress', () => {
    const grouped = groupSubmissions({
      bountyId,
      submissions: [
        submission({ name: 'Proposal One' }),
        submission({
          id: 'r2',
          entityId: proposalTwoId,
          name: 'Proposal Two',
          createdAt: new Date('2026-04-04T11:00:00.000Z'),
        }),
      ],
      payoutItems: [],
      proposalStatuses: new Map([
        [proposalOneId, 'ACCEPTED'],
        [proposalTwoId, 'REJECTED'],
      ]),
      lifecycleRecords: [],
      currentUserEntityId: creatorId,
      isSpaceEditor: false,
    });

    expect(grouped).toHaveLength(1);
    expect(grouped[0].status).toBe('in-progress');
    expect(grouped[0].canRequestReview).toBe(true);
    expect(grouped[0].canReviewAndPayout).toBe(false);
    // Newest first inside the row; governance status is nested display data only.
    expect(grouped[0].proposals.map(p => p.status)).toEqual(['Rejected', 'Accepted']);
    expect(grouped[0].submissionKey).toBe(`${bountyId}:${creatorId}:${proposalOneId}`);
  });

  it('splits later proposals into a new submission after a paid segment and keeps lifecycle status for unpaid rows', () => {
    const grouped = groupSubmissions({
      bountyId,
      submissions: [
        submission({ name: 'Paid Proposal' }),
        submission({
          id: 'r2',
          entityId: proposalTwoId,
          name: 'Needs Review',
          createdAt: new Date('2026-04-06T10:00:00.000Z'),
        }),
      ],
      payoutItems: [payout()],
      proposalStatuses: new Map(),
      lifecycleRecords: [
        record({}),
        record({
          submissionKey: buildSubmissionKey(bountyId, creatorId, proposalTwoId),
          firstProposalId: proposalTwoId,
          proposalIds: [proposalTwoId],
          lastActiveAt: '2026-04-06T10:00:00.000Z',
        }),
      ],
      currentUserEntityId: creatorId,
      isSpaceEditor: true,
    });

    expect(grouped).toHaveLength(2);
    expect(grouped[0].firstProposalId).toBe(proposalTwoId);
    expect(grouped[0].status).toBe('ready-for-review');
    expect(grouped[0].canReviewAndPayout).toBe(true);
    expect(grouped[1].firstProposalId).toBe(proposalOneId);
    expect(grouped[1].status).toBe('paid');
    expect(grouped[1].payoutAmount).toBe(120);
    // Paid on the KG but the lifecycle record still says ready-for-review → retry affordance.
    expect(grouped[1].needsPayoutRetry).toBe(true);
    expect(grouped[1].retrySubmissionLifecycleInput).toEqual({
      submissionKey: `${bountyId}:${creatorId}:${proposalOneId}`,
      creatorEntityId: creatorId,
      firstProposalId: proposalOneId,
      proposalIds: [proposalOneId],
      lastActiveAt: new Date('2026-04-04T10:00:00.000Z'),
    });
    expect(grouped[1].canReviewAndPayout).toBe(false);
  });

  it('freezes a reviewed segment so later proposals start a new submission row', () => {
    const proposalThreeId = 'ffffffffffffffffffffffffffffffff';
    const grouped = groupSubmissions({
      bountyId,
      submissions: [
        submission({ name: 'Proposal One' }),
        submission({
          id: 'r2',
          entityId: proposalTwoId,
          name: 'Proposal Two',
          createdAt: new Date('2026-04-04T11:00:00.000Z'),
        }),
        submission({
          id: 'r3',
          entityId: proposalThreeId,
          name: 'Proposal Three',
          createdAt: new Date('2026-04-04T12:00:00.000Z'),
        }),
      ],
      payoutItems: [],
      proposalStatuses: new Map(),
      lifecycleRecords: [
        record({ proposalIds: [proposalOneId, proposalTwoId], lastActiveAt: '2026-04-04T11:00:00.000Z' }),
      ],
      currentUserEntityId: creatorId,
      isSpaceEditor: false,
    });

    expect(grouped).toHaveLength(2);
    expect(grouped[0].firstProposalId).toBe(proposalThreeId);
    expect(grouped[0].status).toBe('in-progress');
    expect(grouped[0].proposals.map(p => p.entityId)).toEqual([proposalThreeId]);
    expect(grouped[1].firstProposalId).toBe(proposalOneId);
    expect(grouped[1].status).toBe('ready-for-review');
    expect(grouped[1].proposals.map(p => p.entityId)).toEqual([proposalTwoId, proposalOneId]);
    // No lifecycle record for the new row → nothing to retry.
    expect(grouped[0].retrySubmissionLifecycleInput).toBeNull();
  });

  it('groups unknown creators by proposal and normalizes dashed ids', () => {
    const grouped = groupSubmissions({
      bountyId,
      submissions: [submission({ creatorEntityId: null, entityId: 'cccccccc-cccc-cccc-cccc-cccccccccccc' })],
      payoutItems: [],
      proposalStatuses: new Map(),
      lifecycleRecords: [],
      isSpaceEditor: false,
    });
    expect(grouped[0].creatorEntityId).toBe(`unknown:${proposalOneId}`);
    expect(grouped[0].firstProposalId).toBe(proposalOneId);
    expect(grouped[0].canRequestReview).toBe(false);
  });
});
