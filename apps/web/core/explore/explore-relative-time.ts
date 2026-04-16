import { formatDistanceToNowStrict } from 'date-fns';

import { EXPLORE_NEW_POST_MAX_AGE_SEC } from './explore-constants';

/**
 * GraphQL may return unix seconds as a string, milliseconds, or an ISO datetime string.
 */
export function parseEntityUpdatedAtToUnixSec(raw: string | undefined): number {
  if (raw == null || raw === '') return 0;
  const s = String(raw).trim();
  const n = Number(s);
  if (Number.isFinite(n)) {
    if (n > 1e12) return Math.floor(n / 1000);
    if (n > 1e9) return Math.floor(n);
  }
  const ms = Date.parse(s);
  if (Number.isFinite(ms)) return Math.floor(ms / 1000);
  return 0;
}

export function isExploreNewPost(updatedAtSec: number, nowSec = Math.floor(Date.now() / 1000)): boolean {
  if (updatedAtSec <= 0) return false;
  return nowSec - updatedAtSec <= EXPLORE_NEW_POST_MAX_AGE_SEC;
}

/**
 * Compact relative labels for the feed metadata row (e.g. `3m ago`, `2d ago`).
 */
export function formatExploreRelativeTime(updatedAtSec: number): string {
  if (updatedAtSec <= 0) return '—';
  const date = new Date(updatedAtSec * 1000);
  const diffSec = Math.max(0, (Date.now() - updatedAtSec * 1000) / 1000);
  if (diffSec < 45) return 'just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 30 * 86400) return `${Math.floor(diffSec / 86400)}d ago`;
  return formatDistanceToNowStrict(date, { addSuffix: true });
}
