/**
 * Debate pair fit (GEO-3224): shapes shared by New match's client and server, and the ordering.
 * Nothing server-only.
 *
 * gaia scores each (debater 1, candidate) pair from data it holds: shared topic interest, and the
 * claims they hold opposite positions on, weighted by how much both care about those claims'
 * topics. geo-chat holds availability. The two meet here, at the surface: the fit score, halved
 * for a candidate who shares no free half-hour with debater 1 in the next two weeks.
 *
 * Fails open: with no fit (gaia unset, slow or down) the order is exactly what it was before.
 */

export type PairFitReason =
  | { kind: 'disagree'; claimId: string; name: string | null; text: string }
  | { kind: 'shared_topic'; topicId: string; name: string | null; text: string };

export type PairFitItem = {
  /** Personal space id, dashless. */
  userId: string;
  score: number;
  parts: {
    interest: number;
    disagreement: number;
    sharedClaims: number;
    opposed: number;
    agreed: number;
    accountWeight: number;
  };
  disagreeing: boolean;
  reason: PairFitReason | null;
};

/** What the web server answers the dialog. `available: false` means rank as before. */
export type AdminPairFitResponse = { available: boolean; items: PairFitItem[] };

/** gaia caps a request at 300; the roster is in the tens. */
export const MAX_PAIR_FIT_CANDIDATES = 300;

/** How much a candidate with no shared free time keeps of their fit. */
export const NO_SHARED_TIME_FACTOR = 0.5;

/**
 * The fit a list sorts on: gaia's score, times NO_SHARED_TIME_FACTOR when their overlap is known
 * and empty. Unknown overlap (not loaded, or geo-chat failed) costs nothing. Someone gaia did not
 * score (an excluded account, or one past the cap) ranks as 0.
 */
export function combinedFit(fit: PairFitItem | undefined, sharedFreeSlots: number | undefined): number {
  const score = fit?.score ?? 0;
  return sharedFreeSlots === 0 ? score * NO_SHARED_TIME_FACTOR : score;
}

/**
 * A comparator for New match: by combined fit when fit is available, falling back to `today` (the
 * order before fit existed) on ties and whenever fit is not available.
 */
export function byPairFit<T>(
  args: {
    available: boolean;
    fitOf: (item: T) => PairFitItem | undefined;
    sharedFreeSlotsOf: (item: T) => number | undefined;
  },
  today: (left: T, right: T) => number
): (left: T, right: T) => number {
  if (!args.available) return today;
  return (left, right) =>
    combinedFit(args.fitOf(right), args.sharedFreeSlotsOf(right)) -
      combinedFit(args.fitOf(left), args.sharedFreeSlotsOf(left)) || today(left, right);
}

/**
 * The reason, said about debater 1 rather than to the reader ("You two ..." is gaia's wording for
 * the pair themselves; an admin is neither).
 */
export function fitReasonText(reason: PairFitReason | null, firstName: string, opposed: number): string | null {
  if (!reason) return null;
  if (reason.kind === 'disagree') {
    if (reason.name) return `Disagrees with ${firstName} on ${reason.name}`;
    return `Disagrees with ${firstName} on ${opposed === 1 ? 'a claim' : `${opposed} claims`}`;
  }
  return reason.name ? `Shares ${firstName}’s interest in ${reason.name}` : `Shares ${firstName}’s interests`;
}

function isItem(value: unknown): value is PairFitItem {
  const v = value as PairFitItem | null;
  return Boolean(v && typeof v === 'object' && typeof v.userId === 'string' && typeof v.score === 'number' && v.parts);
}

/** Keeps only well-formed items; anything else from upstream is dropped rather than trusted. */
export function parsePairFitItems(value: unknown): PairFitItem[] | null {
  const items = (value as { items?: unknown } | null)?.items;
  if (!Array.isArray(items)) return null;
  return items.filter(isItem);
}
