import type { WinnerShare } from '~/core/claims/browse/claim-debates';
import { parseEntityUpdatedAtToUnixSec } from '~/core/explore/explore-relative-time';
import { equals as idEquals, uuidToHex } from '~/core/id/normalize';

/**
 * What a People row says about someone, after every "omit, never zero" rule has been applied.
 *
 * A `null` field is one the row leaves out. New people arrive continuously, so a thin row is a
 * permanent case rather than a beta one: "0 debates · 0% won" reads as failure where absence reads
 * as new. The join date is the row's floor — everybody has one — so a person with no record still
 * gets a complete-looking row.
 */
export type PersonRecord = {
  positions: number | null;
  debatesArgued: number | null;
  /**
   * `percent` is `wins` over `of`, the debates they argued. `judged` is how many of those anybody
   * has voted on — carried so the row can say what the percentage is actually derived from rather
   * than presenting a lower bound as a settled figure.
   */
  winRate: { percent: number; wins: number; of: number; judged: number } | null;
  joinedAt: Date | null;
};

export type PersonRecordInput = {
  /** The person's personal space id — the same id debate sides point at and `userVotes.userId` holds. */
  personId: string;
  /** Distinct claims they hold a position on, not `userVotes` rows — see `readPersonRecords`. */
  positions: number;
  /** A page of their position rows came back full, so the distinct-claim count under-reports. */
  positionsTruncated: boolean;
  /** Every debate they argued, either side, already de-duplicated. */
  debateIds: string[];
  /** A relation page came back full, so `debateIds` is a subset and any count from it under-reports. */
  truncated: boolean;
  /** Unix seconds — stringified or numeric — or ISO 8601, as `entity.createdAt` may return it. */
  createdAt: string | number | null;
  /**
   * Winner shares keyed by `uuidToHex` — already canonical. Normalised once by the caller rather
   * than per person, because the same map is read for every row on the tab.
   */
  sharesByDebateId: Map<string, WinnerShare>;
};

/**
 * Re-keys a winner map by canonical hex id, once, for every row that will read it.
 *
 * The two joins in the derivation below cross a service boundary and the sides do not agree on how
 * a UUID is written: the indexer returns them dashed, while the graph query and the matchmaking
 * presence feed return them dashless. An exact match would silently find nothing — no share for any
 * debate — and quietly report a real record as 0%.
 */
export function canonicalizeWinnerShares(winnerByDebateId: Map<string, WinnerShare>): Map<string, WinnerShare> {
  const canonical = new Map<string, WinnerShare>();
  for (const [id, share] of winnerByDebateId) canonical.set(uuidToHex(id), share);
  return canonical;
}

/**
 * Win rate is wins over debates *argued*, not over debates anyone voted on.
 *
 * The two diverge whenever a debate goes unwatched and keep diverging at scale. Debates argued is
 * the more honest reading — an unwatched debate is not a win — and picking it once here is what
 * keeps the row, the record page and anything later from disagreeing.
 *
 * A tie is not a win. It still counts in the denominator, because it was still argued.
 *
 * That denominator makes every rate a *lower bound*: unjudged debates sit in it, so the figure can
 * only rise as they are judged. Which is fine at 18% and not fine at 0%, because zero is the one
 * value that reads as a verdict rather than a measurement — "won none of them" where the truth is
 * "nobody has watched most of them". So a rate is shown when it is settled (every debate judged) or
 * when at least one debate has actually been won; a 0% derived from a partly-judged record is
 * withheld, which is the row's own omit-never-zero rule applied to the rate itself. On the live
 * graph today only 14 of 55 debates are judged at all, so this is the common case, not an edge one.
 */
export function derivePersonRecord({
  personId,
  positions,
  positionsTruncated,
  debateIds,
  truncated,
  createdAt,
  sharesByDebateId,
}: PersonRecordInput): PersonRecord {
  const joinedAt = parseCreatedAt(createdAt);
  // A truncated page of positions is an arbitrary subset of the claims they answered, so the
  // distinct count from it is quietly low — withheld for the same reason the debate count is.
  const positionsHeld = !positionsTruncated && positions > 0 ? positions : null;

  // A truncated page is an arbitrary subset of someone's debates, so both the count and any rate
  // derived from it would be quietly low. No number is the honest answer; a wrong one is not.
  if (truncated) {
    return { positions: positionsHeld, debatesArgued: null, winRate: null, joinedAt };
  }

  const debatesArgued = debateIds.length;

  let wins = 0;
  let judged = 0;
  for (const debateId of debateIds) {
    const share = sharesByDebateId.get(uuidToHex(debateId));
    if (!share || share.totalVotes === 0) continue;
    judged += 1;
    // The winner's space id crosses the same service seam as the debate keys above, so this is a
    // dash- and case-insensitive comparison rather than `===`.
    if (!share.tied && idEquals(share.spaceId, personId)) wins += 1;
  }

  const rateIsHonest = judged > 0 && (wins > 0 || judged === debatesArgued);

  return {
    positions: positionsHeld,
    debatesArgued: debatesArgued > 0 ? debatesArgued : null,
    winRate:
      debatesArgued > 0 && rateIsHonest
        ? { percent: Math.round((wins / debatesArgued) * 100), wins, of: debatesArgued, judged }
        : null,
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
