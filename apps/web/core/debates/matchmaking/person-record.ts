import { parseEntityUpdatedAtToUnixSec } from '~/core/explore/explore-relative-time';

/**
 * What a People row says about someone, after every "omit, never zero" rule has been applied.
 *
 * A `null` field is one the row leaves out. New people arrive continuously, so a thin row is a
 * permanent case rather than a beta one: a row of zeroes reads as failure where absence reads as
 * new. The join date is the row's floor — everybody has one — so a person with no record still gets
 * a complete-looking row.
 */
export type PersonRecord = {
  positions: number | null;
  debatesArgued: number | null;
  /** Spaces with activity already observed, even when a capped page makes the exact counts incomplete. */
  activeSpaceIds: ReadonlySet<string>;
  /** Distinct claims the person has answered, grouped by response space; absent if the page was short. */
  claimsBySpace?: ReadonlyMap<string, number>;
  /**
   * Published debates grouped by the space they were recorded in. Used to order and describe the
   * active-space list; absent if the relation page was short.
   */
  debatesBySpace?: ReadonlyMap<string, number>;
  joinedAt: Date | null;
};

export type PersonRecordInput = {
  /** Distinct claims they hold a position on, not `userVotes` rows — see `readPersonRecords`. */
  positions: number;
  /** Their position rows came back short of what the server holds, so the distinct count is low. */
  positionsTruncated: boolean;
  /** Distinct answered claims grouped by response space. */
  claimsBySpace?: ReadonlyMap<string, number>;
  /** Every debate they argued, either side, already de-duplicated. */
  debateIds: string[];
  /** Published debates grouped by relation space, already de-duplicated per debate and space. */
  debatesBySpace?: ReadonlyMap<string, number>;
  /** A side's relations came back short, so `debateIds` is a subset and any count from it is low. */
  truncated: boolean;
  /** Unix seconds — stringified or numeric — or ISO 8601, as `entity.createdAt` may return it. */
  createdAt: string | number | null;
};

export function derivePersonRecord({
  positions,
  positionsTruncated,
  claimsBySpace = new Map(),
  debateIds,
  debatesBySpace = new Map(),
  truncated,
  createdAt,
}: PersonRecordInput): PersonRecord {
  const joinedAt = parseCreatedAt(createdAt);
  const activeSpaceIds = new Set<string>();
  for (const counts of [claimsBySpace, debatesBySpace]) {
    for (const [spaceId, count] of counts) {
      if (count > 0) activeSpaceIds.add(spaceId);
    }
  }
  // A truncated page of positions is an arbitrary subset of the claims they answered, so the
  // distinct count from it is quietly low — withheld for the same reason the debate count is.
  const positionsHeld = !positionsTruncated && positions > 0 ? positions : null;

  // A truncated page is an arbitrary subset of someone's debates, so its count would be quietly
  // low. No number is the honest answer; a wrong one is not.
  if (truncated) {
    return {
      positions: positionsHeld,
      debatesArgued: null,
      activeSpaceIds,
      claimsBySpace: positionsTruncated ? undefined : claimsBySpace,
      debatesBySpace: undefined,
      joinedAt,
    };
  }

  const debatesArgued = debateIds.length;

  return {
    positions: positionsHeld,
    debatesArgued: debatesArgued > 0 ? debatesArgued : null,
    activeSpaceIds,
    claimsBySpace: positionsTruncated ? undefined : claimsBySpace,
    debatesBySpace,
    joinedAt,
  };
}

/**
 * `createdAt` is typed as unix seconds — stringified or numeric — or an ISO 8601 string, "varies by
 * backend". Parsed through the helper that already handles all three rather than assuming the one
 * form this happened to return when it was measured: seconds would read an ISO value as no date at
 * all, and a millisecond value as a year in the sixty-seventh millennium.
 */
function parseCreatedAt(value: string | number | null): Date | null {
  if (value === null || value === undefined || value === '') return null;
  // Stringified before anything reads it: the scalar is documented as numeric *or* string, and a
  // number arriving at a string method takes the whole tab down mid-render.
  const raw = String(value).trim();
  if (raw === '') return null;

  // The helper falls back to `Date.parse`, which is lenient enough to read "0" as the year 2000.
  // A row is better with no join date than with a wrong one, so a non-positive number is rejected
  // before it can be read as a date at all.
  const asNumber = Number(raw);
  if (Number.isFinite(asNumber) && asNumber <= 0) return null;

  const seconds = parseEntityUpdatedAtToUnixSec(raw);
  return seconds > 0 ? new Date(seconds * 1000) : null;
}

/**
 * "On Geo since Jan 2026".
 *
 * Deliberately a month, not a date: this is when the personal space was created, which is close to
 * signing up but is not a signup timestamp, and a precise-looking date would claim more than the
 * field knows.
 */
export function formatJoinedAt(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}
