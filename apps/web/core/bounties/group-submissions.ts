/**
 * Groups a bounty's linked proposals into "submissions" — one row per curator
 * per segment. Ported with unchanged semantics from curator-app's
 * `group-submissions.ts` so both apps show identical rows and produce
 * identical lifecycle keys (`bountyId:creatorEntityId:firstProposalId`):
 *
 * - Proposals are walked per creator in ascending createdAt order.
 * - A change of payout (none↔some, or one payout↔another) flushes a segment.
 * - Once a lifecycle record exists for a segment, its proposalIds are frozen;
 *   later proposals start a new row.
 * - Status precedence: a payout on the KG ⇒ `paid`; else the lifecycle
 *   record's status; else `in-progress`. Proposal governance status is nested
 *   display data and never promotes the row.
 * - `needsPayoutRetry` = paid on the KG but the lifecycle record disagrees —
 *   the designed recovery loop after a failed payout phase 3.
 */
import { uuidToHex } from '~/core/id/normalize';

import type { SubmissionLifecycleRecord, SubmissionLifecycleStatus } from './api';

export type ProposalGovernanceStatus = 'PROPOSED' | 'ACCEPTED' | 'REJECTED' | 'CANCELED' | 'EXECUTED';
export type ProposalDisplayStatus = 'Pending' | 'Accepted' | 'Rejected' | 'Executable';

export type SubmissionItem = {
  /** The submission relation id. */
  id: string;
  /** Proposal entity id. */
  entityId: string;
  name: string;
  /** Creator identity = the creator's personal space id (what curator-backend authorizes lifecycle actions on). */
  creatorEntityId: string | null;
  creatorName: string | null;
  /** The DAO space the proposal was made in (for links). */
  spaceId: string;
  createdAt: Date;
};

export type PayoutItem = {
  /** The payout relation id — also curator-backend's idempotency handle. */
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

export type SubmissionSegmentInput = {
  submissionKey: string;
  creatorEntityId: string;
  firstProposalId: string;
  proposalIds: string[];
  lastActiveAt: Date;
};

export type GroupedSubmission = {
  submissionKey: string;
  creatorEntityId: string;
  creatorName: string | null;
  firstProposalId: string;
  proposalIds: string[];
  status: SubmissionLifecycleStatus;
  lastActiveAt: Date;
  payoutId?: string;
  payoutAmount?: number;
  needsPayoutRetry: boolean;
  /** Present when a lifecycle record exists — the payload to re-mark it paid. */
  retrySubmissionLifecycleInput: SubmissionSegmentInput | null;
  /** The segment as lifecycle mutations expect it. */
  segmentInput: SubmissionSegmentInput;
  proposals: GroupedProposal[];
  canRequestReview: boolean;
  canReviewAndPayout: boolean;
};

type GroupSubmissionsArgs = {
  bountyId: string;
  submissions: readonly SubmissionItem[];
  payoutItems: readonly PayoutItem[];
  proposalStatuses: ReadonlyMap<string, ProposalGovernanceStatus>;
  lifecycleRecords: readonly SubmissionLifecycleRecord[];
  /** The viewer's personal space id — enables "Request review" on own rows. */
  currentUserEntityId?: string | null;
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
  lifecycleRecords,
  currentUserEntityId,
  isSpaceEditor,
}: GroupSubmissionsArgs): GroupedSubmission[] {
  const payoutByProposalId = new Map<string, PayoutItem>();
  for (const payout of payoutItems) {
    for (const proposalId of payout.proposalIds) payoutByProposalId.set(uuidToHex(proposalId), payout);
  }

  const lifecycleBySubmissionKey = new Map(lifecycleRecords.map(record => [record.submissionKey, record]));

  const submissionsByCreator = new Map<string, SubmissionItem[]>();
  for (const submission of [...submissions].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())) {
    const creatorEntityId = submission.creatorEntityId
      ? uuidToHex(submission.creatorEntityId)
      : `unknown:${uuidToHex(submission.entityId)}`;
    const list = submissionsByCreator.get(creatorEntityId) ?? [];
    list.push(submission);
    submissionsByCreator.set(creatorEntityId, list);
  }

  const normalizedCurrentUser = currentUserEntityId ? uuidToHex(currentUserEntityId) : undefined;
  const grouped: GroupedSubmission[] = [];

  for (const [creatorEntityId, creatorSubmissions] of submissionsByCreator.entries()) {
    let currentSegment: SubmissionItem[] = [];
    let currentPayoutId: string | null = null;

    const currentLifecycleRecord = () => {
      if (currentSegment.length === 0) return undefined;
      return lifecycleBySubmissionKey.get(buildSubmissionKey(bountyId, creatorEntityId, currentSegment[0].entityId));
    };

    const flushSegment = () => {
      if (currentSegment.length === 0) return;
      const first = currentSegment[0];
      const proposalIds = currentSegment.map(p => uuidToHex(p.entityId));
      const submissionKey = buildSubmissionKey(bountyId, creatorEntityId, first.entityId);
      const lifecycleRecord = lifecycleBySubmissionKey.get(submissionKey);
      const payout = currentPayoutId ? payoutItems.find(item => item.id === currentPayoutId) : undefined;
      const lastActiveAt = new Date(Math.max(...currentSegment.map(p => p.createdAt.getTime())));
      const segmentInput: SubmissionSegmentInput = {
        submissionKey,
        creatorEntityId,
        firstProposalId: uuidToHex(first.entityId),
        proposalIds,
        lastActiveAt,
      };
      const needsPayoutRetry = !!payout && lifecycleRecord !== undefined && lifecycleRecord.status !== 'paid';
      const status: SubmissionLifecycleStatus = payout ? 'paid' : (lifecycleRecord?.status ?? 'in-progress');

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
        needsPayoutRetry,
        retrySubmissionLifecycleInput: lifecycleRecord ? segmentInput : null,
        segmentInput,
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
        canRequestReview: normalizedCurrentUser === creatorEntityId && status === 'in-progress',
        canReviewAndPayout: isSpaceEditor && status !== 'paid' && status !== 'rejected',
      });

      currentSegment = [];
      currentPayoutId = null;
    };

    for (const submission of creatorSubmissions) {
      const payoutId = payoutByProposalId.get(uuidToHex(submission.entityId))?.id ?? null;
      const record = currentLifecycleRecord();
      const outsideFrozenSegment =
        !!record && !record.proposalIds.map(uuidToHex).includes(uuidToHex(submission.entityId));

      if (
        currentSegment.length > 0 &&
        ((payoutId !== currentPayoutId && (payoutId !== null || currentPayoutId !== null)) || outsideFrozenSegment)
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
