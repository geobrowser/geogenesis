/**
 * Groups a bounty's linked proposals into "submissions" — one row per curator
 * per segment. Semantics follow curator-app's `group-submissions.ts` so both
 * apps show identical rows and identical keys
 * (`bountyId:creatorEntityId:firstProposalId`), reading ONLY the knowledge
 * graph:
 *
 * - Proposals are walked per creator in ascending createdAt order.
 * - A change of payout (none↔some, or one payout↔another) flushes a segment.
 * - Status is derived from the graph: a payout covering the segment ⇒ `paid`;
 *   else a latest failing review covering the segment's proposal set ⇒
 *   `rejected`; else `in-progress`. Proposal governance status is nested
 *   display data and never promotes the row.
 */
import { uuidToHex } from '~/core/id/normalize';

export type SubmissionStatus = 'in-progress' | 'paid' | 'rejected';

export type ProposalGovernanceStatus = 'PROPOSED' | 'ACCEPTED' | 'REJECTED' | 'CANCELED' | 'EXECUTED';
export type ProposalDisplayStatus = 'Pending' | 'Accepted' | 'Rejected' | 'Executable';

export type SubmissionItem = {
  /** The submission relation id. */
  id: string;
  /** Proposal entity id. */
  entityId: string;
  name: string;
  /** Creator identity = the creator's personal space id (the space the link relation was authored in). */
  creatorEntityId: string | null;
  creatorName: string | null;
  /** The DAO space the proposal was made in (for links). */
  spaceId: string;
  createdAt: Date;
};

export type PayoutItem = {
  /** The payout relation id. */
  id: string;
  payoutEntityId: string;
  recipientEntityId: string;
  recipientName: string | null;
  amount: number;
  proposalIds: string[];
  createdAt: Date;
};

export type GroupedProposal = {
  entityId: string;
  name: string;
  spaceId: string;
  createdAt: Date;
  status: ProposalDisplayStatus;
};

export type GroupedSubmission = {
  submissionKey: string;
  creatorEntityId: string;
  creatorName: string | null;
  firstProposalId: string;
  proposalIds: string[];
  status: SubmissionStatus;
  lastActiveAt: Date;
  payoutId?: string;
  payoutAmount?: number;
  proposals: GroupedProposal[];
  canReviewAndPayout: boolean;
};

/** The slice of a review that grouping needs: which proposals it covers, and its verdict. */
export type ReviewVerdict = { proposalIds: readonly string[]; pass: boolean; createdAt: Date };

type GroupSubmissionsArgs = {
  bountyId: string;
  submissions: readonly SubmissionItem[];
  payoutItems: readonly PayoutItem[];
  proposalStatuses: ReadonlyMap<string, ProposalGovernanceStatus>;
  /** Knowledge-graph reviews; a latest failing review marks its segment rejected. */
  reviews?: readonly ReviewVerdict[];
  isSpaceEditor: boolean;
};

export function toProposalDisplayStatus(status?: ProposalGovernanceStatus | null): ProposalDisplayStatus {
  if (status === 'ACCEPTED' || status === 'EXECUTED') return 'Accepted';
  if (status === 'REJECTED' || status === 'CANCELED') return 'Rejected';
  return 'Pending';
}

export function buildSubmissionKey(bountyId: string, creatorEntityId: string, firstProposalId: string): string {
  return `${uuidToHex(bountyId)}:${uuidToHex(creatorEntityId)}:${uuidToHex(firstProposalId)}`;
}

export function groupSubmissions({
  bountyId,
  submissions,
  payoutItems,
  proposalStatuses,
  reviews = [],
  isSpaceEditor,
}: GroupSubmissionsArgs): GroupedSubmission[] {
  const payoutByProposalId = new Map<string, PayoutItem>();
  for (const payout of payoutItems) {
    for (const proposalId of payout.proposalIds) payoutByProposalId.set(uuidToHex(proposalId), payout);
  }

  const latestReviewByProposalSet = new Map<string, ReviewVerdict>();
  for (const review of reviews) {
    const key = buildProposalSetKey(review.proposalIds);
    const existing = latestReviewByProposalSet.get(key);
    if (!existing || review.createdAt.getTime() >= existing.createdAt.getTime()) {
      latestReviewByProposalSet.set(key, review);
    }
  }

  const submissionsByCreator = new Map<string, SubmissionItem[]>();
  for (const submission of [...submissions].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())) {
    const creatorEntityId = submission.creatorEntityId
      ? uuidToHex(submission.creatorEntityId)
      : `unknown:${uuidToHex(submission.entityId)}`;
    const list = submissionsByCreator.get(creatorEntityId) ?? [];
    list.push(submission);
    submissionsByCreator.set(creatorEntityId, list);
  }

  const grouped: GroupedSubmission[] = [];

  for (const [creatorEntityId, creatorSubmissions] of submissionsByCreator.entries()) {
    let currentSegment: SubmissionItem[] = [];
    let currentPayoutId: string | null = null;

    const flushSegment = () => {
      if (currentSegment.length === 0) return;
      const first = currentSegment[0];
      const proposalIds = currentSegment.map(p => uuidToHex(p.entityId));
      const submissionKey = buildSubmissionKey(bountyId, creatorEntityId, first.entityId);
      const payout = currentPayoutId ? payoutItems.find(item => item.id === currentPayoutId) : undefined;
      const lastActiveAt = new Date(Math.max(...currentSegment.map(p => p.createdAt.getTime())));
      const latestReview = latestReviewByProposalSet.get(buildProposalSetKey(proposalIds));
      const status: SubmissionStatus = payout
        ? 'paid'
        : latestReview && !latestReview.pass
          ? 'rejected'
          : 'in-progress';

      grouped.push({
        submissionKey,
        creatorEntityId,
        creatorName: first.creatorName,
        firstProposalId: uuidToHex(first.entityId),
        proposalIds,
        status,
        lastActiveAt,
        payoutId: payout?.id,
        payoutAmount: payout?.amount,
        proposals: [...currentSegment]
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          .map(p => ({
            entityId: uuidToHex(p.entityId),
            name: p.name,
            spaceId: p.spaceId,
            createdAt: p.createdAt,
            status: toProposalDisplayStatus(
              proposalStatuses.get(p.entityId) ?? proposalStatuses.get(uuidToHex(p.entityId))
            ),
          })),
        canReviewAndPayout: isSpaceEditor && status !== 'paid',
      });

      currentSegment = [];
      currentPayoutId = null;
    };

    for (const submission of creatorSubmissions) {
      const payoutId = payoutByProposalId.get(uuidToHex(submission.entityId))?.id ?? null;

      if (
        currentSegment.length > 0 &&
        payoutId !== currentPayoutId &&
        (payoutId !== null || currentPayoutId !== null)
      ) {
        flushSegment();
      }

      currentSegment.push(submission);
      currentPayoutId = payoutId;
    }

    flushSegment();
  }

  return grouped.sort((a, b) => b.lastActiveAt.getTime() - a.lastActiveAt.getTime());
}

/** Reviews cover a proposal set; the key is the sorted, normalized set. Same rule as curator-app. */
export function buildProposalSetKey(proposalIds: readonly string[]): string {
  return [...new Set(proposalIds.map(uuidToHex))].sort().join(':');
}

/** Groups reviews (anything with `proposalIds`) under the submission rows whose proposal set they cover. */
export function reviewsBySubmissionKey<T extends { proposalIds: readonly string[] }>(
  submissions: readonly GroupedSubmission[],
  reviews: readonly T[]
): Map<string, T[]> {
  const byProposalSet = new Map<string, T[]>();
  for (const review of reviews) {
    const key = buildProposalSetKey(review.proposalIds);
    byProposalSet.set(key, [...(byProposalSet.get(key) ?? []), review]);
  }
  const out = new Map<string, T[]>();
  for (const submission of submissions) {
    const matched = byProposalSet.get(buildProposalSetKey(submission.proposalIds));
    if (matched && matched.length > 0) out.set(submission.submissionKey, matched);
  }
  return out;
}
