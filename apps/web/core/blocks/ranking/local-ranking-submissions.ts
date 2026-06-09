import type { RankingSubmissionRecord, RankingSubmissionSlot } from './ranking-submission-types';
import {
  parseSubmissionsBlob,
  serializeSubmissionsBlob,
  submissionsStorageKey,
  upsertSubmission,
} from './ranking-submissions';

/**
 * It will be replaced with createRank/updateRank
 */

export const RANKING_LOCAL_SUBMISSION_SAVED_EVENT = 'geogenesis:ranking-local-submission-saved';

export function notifyRankingLocalSubmissionSaved(spaceId: string, blockId: string) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(RANKING_LOCAL_SUBMISSION_SAVED_EVENT, { detail: { spaceId, blockId } }));
}

export function loadLocalRankingSubmissions(spaceId: string, blockId: string): RankingSubmissionRecord[] {
  if (typeof window === 'undefined') return [];
  const raw = window.localStorage.getItem(submissionsStorageKey(spaceId, blockId));
  const blob = parseSubmissionsBlob(raw);
  return Object.entries(blob.submissions).map(([authorSpaceId, submission]) => ({
    id: `local-rank-${authorSpaceId}`,
    authorSpaceId,
    targetBlockId: blockId,
    targetBlockSpaceId: spaceId,
    orderedEntityIds: submission.orderedEntityIds,
    createdAt: submission.updatedAt,
    author: {
      spaceId: authorSpaceId,
      address: `0x${'0'.repeat(40)}` as `0x${string}`,
      name: null,
      avatarUrl: null,
    },
  }));
}

export function saveLocalMyRanking({
  spaceId,
  blockId,
  personalSpaceId,
  slots,
  author,
}: {
  spaceId: string;
  blockId: string;
  personalSpaceId: string;
  slots: RankingSubmissionSlot[];
  author: RankingSubmissionRecord['author'];
}): RankingSubmissionRecord {
  const orderedEntityIds = slots.map(s => s.id).filter(Boolean);
  const key = submissionsStorageKey(spaceId, blockId);
  const blob = parseSubmissionsBlob(typeof window !== 'undefined' ? window.localStorage.getItem(key) : null);
  const next = upsertSubmission(blob, personalSpaceId, orderedEntityIds);
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(key, serializeSubmissionsBlob(next));
    notifyRankingLocalSubmissionSaved(spaceId, blockId);
  }
  return {
    id: `local-rank-${personalSpaceId}`,
    authorSpaceId: personalSpaceId,
    targetBlockId: blockId,
    targetBlockSpaceId: spaceId,
    orderedEntityIds,
    createdAt: new Date().toISOString(),
    author,
  };
}
