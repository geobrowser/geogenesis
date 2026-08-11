import { ID } from '~/core/id';

import type { AggregatedRankingSubmitterRef } from './ranking-block-relations';

const MS_PER_HOUR = 60 * 60 * 1000;

export function parseTimestampMs(raw: string | number | undefined | null): number {
  if (raw == null) return 0;
  if (typeof raw === 'number') {
    return raw < 1_000_000_000_000 ? raw * 1000 : raw;
  }
  const trimmed = raw.trim();
  if (!trimmed) return 0;
  const asNumber = Number(trimmed);
  if (!Number.isNaN(asNumber)) {
    return asNumber < 1_000_000_000_000 ? asNumber * 1000 : asNumber;
  }
  const parsed = Date.parse(trimmed);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function isRollingSubmissionLive({
  personalSpaceId,
  myRankEntityId,
  aggregatedSubmitterRefs,
}: {
  personalSpaceId: string | null | undefined;
  myRankEntityId: string | null | undefined;
  aggregatedSubmitterRefs: AggregatedRankingSubmitterRef[];
}): boolean {
  if (!personalSpaceId && !myRankEntityId) return false;

  return aggregatedSubmitterRefs.some(
    ref =>
      (Boolean(myRankEntityId) && ID.equals(ref.rankEntityId, myRankEntityId!)) ||
      (Boolean(personalSpaceId) && Boolean(ref.spaceId) && ID.equals(ref.spaceId!, personalSpaceId!))
  );
}

export function getRollingExpiryMs(submittedAtMs: number, frequencyHours: number): number {
  return submittedAtMs + frequencyHours * MS_PER_HOUR;
}

/**
 * Whether publishing a ballot has to create a new rank entity rather than update
 * the author's existing one.
 *
 * True with no existing ballot, and true again once a Rolling block has rolled
 * one off. The roll-off case is the subtle one: the indexer derives
 * `submitted_at` from the block timestamp of the edit that *creates* the rank
 * entity, and an `updateRank` edit re-emits only the vote relations, never the
 * rank entity itself. Updating in place would leave `submitted_at` frozen at the
 * original submission, so a rolled-off ballot could never climb back inside its
 * window — re-submission has to mint a fresh entity to get a fresh timestamp.
 *
 * Note this is orthogonal to *retaining* the rolled-off ordering: an expired
 * ballot is still shown in the compose view (see `useRankingSubmissions`), so
 * re-submission confirms the previous ranking instead of rebuilding it.
 */
export function shouldMintNewRankEntity({
  isRolling,
  hasExistingBallot,
  isSubmissionLive,
}: {
  isRolling: boolean;
  hasExistingBallot: boolean;
  isSubmissionLive: boolean;
}): boolean {
  if (!hasExistingBallot) return true;
  return isRolling && !isSubmissionLive;
}

export function formatRollingSubmissionLabel({
  hasSubmission,
  isLive,
  submittedAtMs,
  frequencyHours,
  now,
}: {
  hasSubmission: boolean;
  isLive: boolean;
  submittedAtMs: number;
  frequencyHours: number | null;
  now: number;
}): string | null {
  if (!hasSubmission) return null;
  if (!isLive) return null;

  if (!frequencyHours || submittedAtMs === 0) return 'Your ranking is live';

  const expiresInMs = getRollingExpiryMs(submittedAtMs, frequencyHours) - now;
  const hours = Math.ceil(expiresInMs / MS_PER_HOUR);
  if (hours >= 48) return `Vote again in ${Math.ceil(hours / 24)} days`;
  if (hours === 1) return 'Vote again in 1 hr';
  return `Vote again in ${hours} hrs`;
}
