import { describe, expect, it } from 'vitest';

import {
  type PayoutItem,
  type ReviewVerdict,
  type SubmissionItem,
  buildProposalSetKey,
  buildSubmissionKey,
  groupSubmissions,
  reviewsBySubmissionKey,
} from './group-submissions';

// Grouping semantics follow curator-app's group-submissions.test.ts (payout
// boundaries, key format, ordering); statuses are derived purely from the
// knowledge graph — payouts mark rows paid, failing reviews mark them rejected.

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

const review = (overrides: Partial<ReviewVerdict> = {}): ReviewVerdict => ({
  proposalIds: [proposalOneId],
  pass: false,
  createdAt: new Date('2026-04-05T09:00:00.000Z'),
  ...overrides,
});

describe('groupSubmissions', () => {
  it('keeps submission status independent from proposal governance status', () => {
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
      isSpaceEditor: false,
    });

    expect(grouped).toHaveLength(1);
    expect(grouped[0].status).toBe('in-progress');
    expect(grouped[0].canReviewAndPayout).toBe(false);
    // Newest first inside the row; governance status is nested display data only.
    expect(grouped[0].proposals.map(p => p.status)).toEqual(['Rejected', 'Accepted']);
    expect(grouped[0].submissionKey).toBe(`${bountyId}:${creatorId}:${proposalOneId}`);
  });

  it('splits later proposals into a new in-progress row after a paid segment', () => {
    const grouped = groupSubmissions({
      bountyId,
      submissions: [
        submission({ name: 'Paid Proposal' }),
        submission({
          id: 'r2',
          entityId: proposalTwoId,
          name: 'Next Batch',
          createdAt: new Date('2026-04-06T10:00:00.000Z'),
        }),
      ],
      payoutItems: [payout()],
      proposalStatuses: new Map(),
      isSpaceEditor: true,
    });

    expect(grouped).toHaveLength(2);
    // Sorted by last activity, newest first: the fresh segment leads.
    expect(grouped[0].status).toBe('in-progress');
    expect(grouped[0].firstProposalId).toBe(proposalTwoId);
    expect(grouped[0].canReviewAndPayout).toBe(true);
    expect(grouped[1].status).toBe('paid');
    expect(grouped[1].payoutAmount).toBe(120);
    expect(grouped[1].canReviewAndPayout).toBe(false);
  });

  it('marks a segment rejected when its latest covering review fails, and paid always wins', () => {
    const failThenPass = groupSubmissions({
      bountyId,
      submissions: [submission({})],
      payoutItems: [],
      proposalStatuses: new Map(),
      reviews: [
        review({ pass: false, createdAt: new Date('2026-04-05T09:00:00.000Z') }),
        review({ pass: true, createdAt: new Date('2026-04-06T09:00:00.000Z') }),
      ],
      isSpaceEditor: true,
    });
    expect(failThenPass[0].status).toBe('in-progress');

    const rejected = groupSubmissions({
      bountyId,
      submissions: [submission({})],
      payoutItems: [],
      proposalStatuses: new Map(),
      reviews: [review({ pass: false })],
      isSpaceEditor: true,
    });
    expect(rejected[0].status).toBe('rejected');
    // Rejected rows can still be re-reviewed by an editor.
    expect(rejected[0].canReviewAndPayout).toBe(true);

    const paidDespiteFail = groupSubmissions({
      bountyId,
      submissions: [submission({})],
      payoutItems: [payout()],
      proposalStatuses: new Map(),
      reviews: [review({ pass: false })],
      isSpaceEditor: true,
    });
    expect(paidDespiteFail[0].status).toBe('paid');
  });

  it('a review covering a different proposal set does not affect the row', () => {
    const grouped = groupSubmissions({
      bountyId,
      submissions: [submission({})],
      payoutItems: [],
      proposalStatuses: new Map(),
      reviews: [review({ proposalIds: [proposalTwoId], pass: false })],
      isSpaceEditor: false,
    });
    expect(grouped[0].status).toBe('in-progress');
  });

  it('groups per creator and treats missing creators as their own rows', () => {
    const grouped = groupSubmissions({
      bountyId,
      submissions: [
        submission({}),
        submission({ id: 'r2', entityId: proposalTwoId, creatorEntityId: null, creatorName: null }),
      ],
      payoutItems: [],
      proposalStatuses: new Map(),
      isSpaceEditor: false,
    });
    expect(grouped).toHaveLength(2);
    expect(grouped.some(g => g.creatorEntityId.startsWith('unknown:'))).toBe(true);
  });

  it('normalizes dashed ids into the submission key', () => {
    expect(buildSubmissionKey('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', creatorId, proposalOneId)).toBe(
      `${bountyId}:${creatorId}:${proposalOneId}`
    );
  });
});

describe('reviewsBySubmissionKey', () => {
  it('matches reviews to rows by normalized proposal set', () => {
    const grouped = groupSubmissions({
      bountyId,
      submissions: [submission({})],
      payoutItems: [],
      proposalStatuses: new Map(),
      isSpaceEditor: false,
    });
    const matched = reviewsBySubmissionKey(grouped, [
      { proposalIds: [`cccccccc-cccc-cccc-cccc-cccccccccccc`] },
      { proposalIds: [proposalTwoId] },
    ]);
    expect(matched.get(grouped[0].submissionKey)).toHaveLength(1);
    expect(buildProposalSetKey([proposalOneId, proposalOneId])).toBe(proposalOneId);
  });
});
