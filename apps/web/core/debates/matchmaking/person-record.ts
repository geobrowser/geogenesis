import type { WinnerShare } from '~/core/claims/browse/claim-debates';
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
  winRate: { percent: number; wins: number; of: number } | null;
  joinedAt: Date | null;
};

export type PersonRecordInput = {
  /** The person's personal space id — the same id debate sides point at and `userVotes.userId` holds. */
  personId: string;
  positions: number;
  /** Every debate they argued, either side, already de-duplicated. */
  debateIds: string[];
  /** A relation page came back full, so `debateIds` is a subset and any count from it under-reports. */
  truncated: boolean;
  /** Unix seconds, as `entity.createdAt` returns it. */
  createdAt: string | null;
  winnerByDebateId: Map<string, WinnerShare>;
};

/**
 * Win rate is wins over debates *argued*, not over debates anyone voted on.
 *
 * The two diverge whenever a debate goes unwatched and keep diverging at scale. Debates argued is
 * the more honest reading — an unwatched debate is not a win — and picking it once here is what
 * keeps the row, the record page and anything later from disagreeing.
 *
 * A tie is not a win. It still counts in the denominator, because it was still argued.
 *
 * The rate is omitted entirely until at least one of their debates has been judged. Otherwise
 * someone whose debates nobody watched reads as 0%, which says they lost rather than that nobody
 * voted — the same failure the omit-never-zero rule exists to avoid.
 */
export function derivePersonRecord({
  personId,
  positions,
  debateIds,
  truncated,
  createdAt,
  winnerByDebateId,
}: PersonRecordInput): PersonRecord {
  const joinedAt = parseUnixSeconds(createdAt);

  // A truncated page is an arbitrary subset of someone's debates, so both the count and any rate
  // derived from it would be quietly low. No number is the honest answer; a wrong one is not.
  if (truncated) {
    return { positions: positions > 0 ? positions : null, debatesArgued: null, winRate: null, joinedAt };
  }

  const debatesArgued = debateIds.length;

  // Both joins below cross a service boundary, and the two sides do not agree on how a UUID is
  // written: the indexer returns them dashed, while the graph query and the matchmaking presence
  // feed return them dashless. An exact match would silently find nothing — no share for any debate,
  // or a real winner who never equals the person — and quietly report a 0% win rate. Canonicalised
  // once here rather than trusted to line up.
  const sharesByDebateId = new Map<string, WinnerShare>();
  for (const [id, share] of winnerByDebateId) sharesByDebateId.set(uuidToHex(id), share);

  let wins = 0;
  let judged = 0;
  for (const debateId of debateIds) {
    const share = sharesByDebateId.get(uuidToHex(debateId));
    if (!share || share.totalVotes === 0) continue;
    judged += 1;
    if (!share.tied && idEquals(share.spaceId, personId)) wins += 1;
  }

  return {
    positions: positions > 0 ? positions : null,
    debatesArgued: debatesArgued > 0 ? debatesArgued : null,
    winRate:
      debatesArgued > 0 && judged > 0
        ? { percent: Math.round((wins / debatesArgued) * 100), wins, of: debatesArgued }
        : null,
    joinedAt,
  };
}

/** `entity.createdAt` comes back as Unix seconds in a string, not an ISO timestamp. */
function parseUnixSeconds(value: string | null): Date | null {
  if (!value) return null;
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  const date = new Date(seconds * 1000);
  return Number.isNaN(date.getTime()) ? null : date;
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
