import { formatDistanceToNowStrict } from 'date-fns';

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

/**
 * Compact relative labels for the feed metadata row (e.g. `3m ago`, `2d ago`).
 */
/**
 * Relative age for a feed row, or null when there is no creation time to show —
 * an entity that only exists as an unpublished local draft has none until it's
 * published, and a dash in its place reads as a loading or broken value.
 */
export function formatExploreRelativeTime(timestampSec: number): string | null {
  if (timestampSec <= 0) return null;
  const date = new Date(timestampSec * 1000);
  const diffSec = Math.max(0, (Date.now() - timestampSec * 1000) / 1000);
  if (diffSec < 45) return 'just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 30 * 86400) return `${Math.floor(diffSec / 86400)}d ago`;
  return formatDistanceToNowStrict(date, { addSuffix: true });
}
