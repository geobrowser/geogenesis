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

export function isCreatedWithinWindow(
  createdAt: string | number | undefined | null,
  frequencyHours: number,
  now: number
): boolean {
  const createdAtMs = parseTimestampMs(createdAt);
  if (createdAtMs === 0) return true;
  return createdAtMs >= now - frequencyHours * MS_PER_HOUR;
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
  if (!isLive) return 'Your ranking has rolled off — submit a fresh ranking';

  if (!frequencyHours || submittedAtMs === 0) return 'Your ranking is live';

  const expiresInMs = getRollingExpiryMs(submittedAtMs, frequencyHours) - now;
  if (expiresInMs <= 0) return 'Your ranking has rolled off — submit a fresh ranking';

  const hours = Math.ceil(expiresInMs / MS_PER_HOUR);
  if (hours >= 48) return `Your ranking expires in ${Math.ceil(hours / 24)} days`;
  if (hours === 1) return 'Your ranking expires in 1 hr';
  return `Your ranking expires in ${hours} hrs`;
}
