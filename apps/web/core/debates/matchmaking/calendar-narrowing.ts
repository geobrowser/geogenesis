/**
 * The calendar's People and Claims panel (GEO-3220), as plain data: what the viewer picked, who
 * holds which claim, and who passes.
 *
 * Kept apart from the component so the filtering rules — OR within a tab, AND across tabs, Matches
 * only narrowing both — can be read and tested in one place. The calendar asks one question of it
 * per person ({@link passesPicks}), and the panel's two lists ask theirs ({@link claimListRows},
 * {@link personListRows}) with the same inputs, so a list cannot offer a pick the week then ignores.
 *
 * People are keyed by `normId(profile_space_id)`, the id positions are published under. Claims by
 * {@link claimPickKey}: space and claim, because a response only counts in the space it was given in
 * (see `claim-row-key`), and two spaces' sides on one claim are two different questions.
 */
import { normId } from '~/core/utils/norm-id';

import type { ParticipantPositionsByClaim } from '../participant-positions';

export type CalendarPicks = {
  /** `normId(profile_space_id)` of each picked person. */
  readonly people: readonly string[];
  /** {@link claimPickKey} of each picked claim. */
  readonly claims: readonly string[];
  readonly matchesOnly: boolean;
};

export const NO_PICKS: CalendarPicks = { people: [], claims: [], matchesOnly: false };

export function hasPicks(picks: CalendarPicks): boolean {
  return picks.people.length > 0 || picks.claims.length > 0 || picks.matchesOnly;
}

export function claimPickKey(spaceId: string, claimId: string): string {
  return `${normId(spaceId)}:${normId(claimId)}`;
}

export function splitClaimPickKey(key: string): { spaceId: string; claimId: string } | null {
  const [spaceId, claimId, ...rest] = key.split(':');
  if (!spaceId || !claimId || rest.length > 0) return null;
  return { spaceId, claimId };
}

/** One claim, as the people on the calendar answered it. */
export type ClaimSummary = {
  key: string;
  claimId: string;
  spaceId: string;
  /** The viewer's side in this claim's space; `null` when they hold none. */
  viewerPosition: boolean | null;
  /** Everyone else on the calendar on each side, by profile key. */
  agree: ReadonlySet<string>;
  disagree: ReadonlySet<string>;
  /** Those on the side opposite the viewer's. Empty when the viewer holds no position. */
  opponents: ReadonlySet<string>;
};

export type ClaimSummaries = {
  byKey: ReadonlyMap<string, ClaimSummary>;
  /** The claim keys each person holds a position on. */
  heldByPerson: ReadonlyMap<string, ReadonlySet<string>>;
  /** Whether the viewer holds any position at all, which Matches only needs to mean anything. */
  viewerHasPositions: boolean;
};

const EMPTY_SET: ReadonlySet<string> = new Set();

/**
 * Every claim someone on the calendar holds a position on, with each side's people.
 *
 * `pool` is who the calendar can draw. A claim only the viewer, or only people off the calendar,
 * answered is no use for finding someone to debate, so it is left out.
 */
export function summarizeClaims(
  positionsByClaim: ParticipantPositionsByClaim,
  viewerProfileSpaceId: string | null,
  pool: ReadonlySet<string>
): ClaimSummaries {
  const viewerId = viewerProfileSpaceId ? normId(viewerProfileSpaceId) : null;
  const byKey = new Map<string, ClaimSummary>();
  const heldByPerson = new Map<string, Set<string>>();
  let viewerHasPositions = false;

  type Draft = { claimId: string; spaceId: string; viewer: boolean | null; agree: Set<string>; disagree: Set<string> };
  const drafts = new Map<string, Draft>();
  for (const rows of positionsByClaim.values()) {
    for (const row of rows) {
      const profileId = normId(row.profileSpaceId);
      const isViewer = profileId === viewerId;
      if (!isViewer && !pool.has(profileId)) continue;
      const key = claimPickKey(row.spaceId, row.claimId);
      const draft = drafts.get(key) ?? {
        claimId: row.claimId,
        spaceId: row.spaceId,
        viewer: null,
        agree: new Set<string>(),
        disagree: new Set<string>(),
      };
      drafts.set(key, draft);
      if (isViewer) {
        draft.viewer = row.position;
        viewerHasPositions = true;
        continue;
      }
      (row.position ? draft.agree : draft.disagree).add(profileId);
      const held = heldByPerson.get(profileId) ?? new Set<string>();
      held.add(key);
      heldByPerson.set(profileId, held);
    }
  }

  for (const [key, draft] of drafts) {
    if (draft.agree.size === 0 && draft.disagree.size === 0) continue;
    byKey.set(key, {
      key,
      claimId: draft.claimId,
      spaceId: draft.spaceId,
      viewerPosition: draft.viewer,
      agree: draft.agree,
      disagree: draft.disagree,
      opponents: draft.viewer === null ? EMPTY_SET : draft.viewer ? draft.disagree : draft.agree,
    });
  }

  return { byKey, heldByPerson, viewerHasPositions };
}

/**
 * Whether a person passes the panel's picks: the week's one question of it. The space pills are the
 * caller's, as before this panel; this is everything the panel adds.
 *
 * - Picked people: only them.
 * - Picked claims: people holding a position on any of them; with Matches only, the opposite one
 *   to the viewer's.
 * - Matches only with no claim picked: people the viewer has at least one match with.
 */
export function passesPicks(
  profileKey: string,
  picks: CalendarPicks,
  claims: ClaimSummaries,
  matchCount: (profileKey: string) => number
): boolean {
  if (picks.people.length > 0 && !picks.people.includes(profileKey)) return false;
  if (picks.claims.length > 0) return picks.claims.some(key => holdsPickedClaim(profileKey, key, picks, claims));
  if (picks.matchesOnly) return matchCount(profileKey) > 0;
  return true;
}

function holdsPickedClaim(profileKey: string, claimKey: string, picks: CalendarPicks, claims: ClaimSummaries) {
  if (picks.matchesOnly) return claims.byKey.get(claimKey)?.opponents.has(profileKey) ?? false;
  return claims.heldByPerson.get(profileKey)?.has(claimKey) ?? false;
}

/** A row in the Claims list. */
export type ClaimListRow = {
  summary: ClaimSummary;
  selected: boolean;
  /** Picked, but the other filters would leave it out: kept so it can be unticked. */
  hidden: boolean;
};

/**
 * The Claims list: claims in the picked spaces, held by the picked people, and with Matches only,
 * where someone on the calendar opposes the viewer. Picks come first and always stay; the rest by
 * most matches, then most people holding them.
 *
 * Search is the panel's, applied after this, so a pick hidden by a search is not called hidden.
 */
export function claimListRows(
  claims: ClaimSummaries,
  picks: CalendarPicks,
  spaceIds: readonly string[]
): ClaimListRow[] {
  const spaces = new Set(spaceIds.map(normId));
  const picked = new Set(picks.claims);
  const passes = (summary: ClaimSummary) => {
    if (spaces.size > 0 && !spaces.has(normId(summary.spaceId))) return false;
    if (picks.matchesOnly && summary.opponents.size === 0) return false;
    if (
      picks.people.length > 0 &&
      !picks.people.some(person => summary.agree.has(person) || summary.disagree.has(person))
    ) {
      return false;
    }
    return true;
  };

  const rows: ClaimListRow[] = [];
  for (const summary of claims.byKey.values()) {
    const selected = picked.has(summary.key);
    const shown = passes(summary);
    if (shown || selected) rows.push({ summary, selected, hidden: !shown });
  }
  // A claim picked from a link that nobody on the calendar holds is still a pick to undo.
  for (const key of picks.claims) {
    if (claims.byKey.has(key)) continue;
    const ids = splitClaimPickKey(key);
    if (!ids) continue;
    rows.push({
      summary: {
        key,
        ...ids,
        viewerPosition: null,
        agree: EMPTY_SET,
        disagree: EMPTY_SET,
        opponents: EMPTY_SET,
      },
      selected: true,
      hidden: true,
    });
  }

  const held = (summary: ClaimSummary) => summary.agree.size + summary.disagree.size;
  return rows.sort(
    (left, right) =>
      Number(right.selected) - Number(left.selected) ||
      right.summary.opponents.size - left.summary.opponents.size ||
      held(right.summary) - held(left.summary) ||
      left.summary.key.localeCompare(right.summary.key)
  );
}

/** What the People list needs to know of each person on the calendar. */
export type PersonFacts = {
  profileKey: string;
  matchCount: number;
  /** Their soonest free half-hour, if any. */
  firstFree: number | null;
  /** Whether the space pills leave them in. */
  inSpaces: boolean;
};

export type PersonListRow<T extends PersonFacts = PersonFacts> = { person: T; selected: boolean; hidden: boolean };

/**
 * The People list: people in the picked spaces, holding a picked claim (the opposite side, with
 * Matches only), and with Matches only, people the viewer has a match with. Picks come first and
 * always stay; the rest by most matches, then soonest free.
 */
export function personListRows<T extends PersonFacts>(
  people: readonly T[],
  picks: CalendarPicks,
  claims: ClaimSummaries
): PersonListRow<T>[] {
  const picked = new Set(picks.people);
  const passes = (person: T) => {
    if (!person.inSpaces) return false;
    if (picks.claims.length > 0) {
      return picks.claims.some(key => holdsPickedClaim(person.profileKey, key, picks, claims));
    }
    return !picks.matchesOnly || person.matchCount > 0;
  };

  const rows: PersonListRow<T>[] = [];
  for (const person of people) {
    const selected = picked.has(person.profileKey);
    const shown = passes(person);
    if (shown || selected) rows.push({ person, selected, hidden: !shown });
  }
  return rows.sort(
    (left, right) =>
      Number(right.selected) - Number(left.selected) ||
      right.person.matchCount - left.person.matchCount ||
      (left.person.firstFree ?? Infinity) - (right.person.firstFree ?? Infinity) ||
      left.person.profileKey.localeCompare(right.person.profileKey)
  );
}

export function togglePick(list: readonly string[], key: string): string[] {
  return list.includes(key) ? list.filter(item => item !== key) : [...list, key];
}

/**
 * The line above the week: what is narrowing it, in words. `null` when nothing is, so the calendar
 * with nothing picked reads exactly as it did before the panel.
 */
export function narrowingSentence({
  picks,
  shownCount,
  spaceNames,
}: {
  picks: CalendarPicks;
  shownCount: number;
  spaceNames: readonly string[];
}): string | null {
  if (!hasPicks(picks) && spaceNames.length === 0) return null;
  const people = `${shownCount} ${shownCount === 1 ? 'person' : 'people'}`;
  const claimCount = picks.claims.length;
  let sentence: string;
  if (claimCount > 0) {
    sentence =
      `Showing ${people}` +
      (picks.matchesOnly ? ' who disagree with you on ' : ' with a position on ') +
      (claimCount === 1 ? 'the claim you picked' : `any of the ${claimCount} claims you picked`) +
      (picks.people.length > 0 ? ', among the people you picked' : '');
  } else if (picks.people.length > 0) {
    sentence = `Showing ${shownCount === 1 ? 'the person' : `the ${people}`} you picked`;
  } else {
    sentence = `Showing ${people}` + (picks.matchesOnly ? ' you have matches with' : ' with open times');
  }
  if (spaceNames.length > 0) sentence += ` in ${spaceNames.join(' or ')}`;
  return `${sentence}.`;
}

/** Why picks are not showing: the names of hidden people, and how many claims the filters hide. */
export function hiddenPicksSentence({
  hiddenPeople,
  hiddenClaimCount,
}: {
  hiddenPeople: readonly { name: string; freeThisWeek: boolean }[];
  hiddenClaimCount: number;
}): string | null {
  const parts: string[] = [];
  const notFree = hiddenPeople.filter(person => !person.freeThisWeek).map(person => person.name);
  const filtered = hiddenPeople.filter(person => person.freeThisWeek).map(person => person.name);
  if (notFree.length > 0)
    parts.push(`${listNames(notFree)} ${notFree.length === 1 ? "isn't" : "aren't"} free this week.`);
  if (filtered.length > 0) {
    parts.push(`${listNames(filtered)} ${filtered.length === 1 ? "doesn't" : "don't"} match your other filters.`);
  }
  if (hiddenClaimCount > 0) {
    parts.push(
      hiddenClaimCount === 1
        ? "A claim you picked doesn't match your other filters."
        : `${hiddenClaimCount} claims you picked don't match your other filters.`
    );
  }
  return parts.length > 0 ? parts.join(' ') : null;
}

function listNames(names: string[]): string {
  if (names.length <= 2) return names.join(' and ');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}
