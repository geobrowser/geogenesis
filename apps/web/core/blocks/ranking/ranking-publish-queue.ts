import { ID } from '~/core/id';

import { type BallotGrades, NO_GRADES, mergeGrades, sameGrades, sortIntoTiers } from './ranking-grades';

/*
 * Ballot publish safety (GEO-3680).
 *
 * Every ballot edit re-sends the whole list: `geo.ranks.update` deletes every
 * vote the index currently holds and re-creates the new list, and the ranking
 * indexer replaces the stored ballot with whatever the edit carries. So an edit
 * built from a stale list silently drops whatever the stale list was missing.
 * Two ways that happened:
 *
 * - Back to back on one device: the second placement was built before the
 *   first had reached the index, so it re-sent the list without the first.
 * - Two devices: the later edit carried only what that device had seen.
 *
 * The publish path now runs one publish at a time per (author space, block),
 * waits for the previous one to be indexed, re-reads the published ballot, and
 * three-way merges the edit onto it. This module holds the pure parts.
 */

/** Generous on purpose: today's ballots hold dozens of items. Lower it with
 *  `NEXT_PUBLIC_RANKING_BALLOT_MAX_ITEMS` once the testnet size measurement
 *  (scripts/measure-ranking-ballot-size.ts) shows where publishing breaks. */
export const RANKING_BALLOT_MAX_ITEMS_DEFAULT = 5000;

export function parseRankingBallotMaxItems(raw: string | undefined): number {
  const parsed = Number(raw?.trim());
  return Number.isInteger(parsed) && parsed > 0 ? parsed : RANKING_BALLOT_MAX_ITEMS_DEFAULT;
}

/** Read inline so Next can substitute the public env var at build time. */
export function getRankingBallotMaxItems(): number {
  return parseRankingBallotMaxItems(process.env.NEXT_PUBLIC_RANKING_BALLOT_MAX_ITEMS);
}

export function rankingBallotTooLargeMessage(count: number, max: number): string {
  const over = count - max;
  return `A ranking can hold up to ${max.toLocaleString('en-US')} items. Remove ${over.toLocaleString('en-US')} ${
    over === 1 ? 'item' : 'items'
  } to publish.`;
}

export const RANKING_CHANGED_ELSEWHERE_MESSAGE =
  'Your ranking changed on another device. We kept the changes from both.';

export const RANKING_CHANGED_ELSEWHERE_ORDER_MESSAGE =
  "Your ranking changed on another device. We kept what both added and removed, in this device's order.";

/** Clearing a ranking that has nothing live to clear for this period. */
export const RANKING_ALREADY_EMPTY_MESSAGE = 'Your ranking is already empty.';

export const RANKING_NOTHING_LEFT_TO_PUBLISH_MESSAGE =
  "Your ranking changed on another device, so this change wasn't published. Check your ranking and try again.";

export const RANKING_OVERTAKEN_MESSAGE =
  "Your ranking changed on another device while this change was saving. Your change wasn't saved yet — check your ranking and publish again.";

export const RANKING_PREVIOUS_PUBLISH_PENDING_MESSAGE =
  'Your last ranking change is still saving. Try again in a moment.';

const norm = (id: string) => ID.uuidToHex(id);

export function sameBallotOrder(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, index) => norm(id) === norm(b[index]));
}

/**
 * Same order and, on Best debates, the same grades (GEO-3729): a regrade can leave the order as it
 * was (the last A regraded B stays where it is), and that is still a change.
 */
export function sameBallot(
  a: readonly string[],
  aGrades: BallotGrades | undefined,
  b: readonly string[],
  bGrades: BallotGrades | undefined
): boolean {
  return sameBallotOrder(a, b) && sameGrades(a, aGrades ?? NO_GRADES, bGrades ?? NO_GRADES);
}

export type BallotMergeResult = {
  ids: string[];
  /** Both sides reordered shared items; this device's order was kept. */
  overrodeTheirOrder: boolean;
};

/**
 * Three-way merge of ordered ballots.
 *
 * - `base`: the published list this device's edit was made from.
 * - `ours`: the list this edit wants to publish.
 * - `theirs`: the list published now (another device's edit, or our own
 *   earlier placement the edit was built without).
 *
 * Membership: base, plus what either side added, minus what either side
 * removed. Nothing either side added is lost and nothing either side removed
 * comes back.
 *
 * Order: an edit that didn't change the relative order of the base items it
 * kept (an add or a removal) leaves the published order alone, and its own
 * additions go next to their neighbours from `ours`. Only when this edit did
 * reorder does its order win; the other side's additions then go next to their
 * neighbours from `theirs`. When both sides reordered, `overrodeTheirOrder`
 * says so, so the ranker can be told.
 */
export function mergeBallotOrders(sides: {
  base: readonly string[];
  ours: readonly string[];
  theirs: readonly string[];
}): BallotMergeResult {
  const { ids, overrodeTheirOrder } = mergeOrders(sides);
  return { ids, overrodeTheirOrder };
}

/** `mergeBallotOrders`, also saying whether this edit's order led the merge (it reordered). */
function mergeOrders({
  base,
  ours,
  theirs,
}: {
  base: readonly string[];
  ours: readonly string[];
  theirs: readonly string[];
}): BallotMergeResult & { weReordered: boolean } {
  const baseSet = new Set(base.map(norm));
  const ourSet = new Set(ours.map(norm));
  const theirSet = new Set(theirs.map(norm));

  const keep = (id: string) => {
    const key = norm(id);
    return baseSet.has(key) ? ourSet.has(key) && theirSet.has(key) : ourSet.has(key) || theirSet.has(key);
  };
  const reordered = (list: readonly string[], listSet: Set<string>) =>
    !sameBallotOrder(
      list.filter(id => baseSet.has(norm(id))),
      base.filter(id => listSet.has(norm(id)))
    );

  const weReordered = reordered(ours, ourSet);
  const theyReordered = reordered(theirs, theirSet);
  const [primary, secondary] = weReordered ? [ours, theirs] : [theirs, ours];
  const secondarySet = weReordered ? theirSet : ourSet;

  const result: string[] = [];
  const inResult = new Set<string>();
  for (const id of primary) {
    if (keep(id) && !inResult.has(norm(id))) {
      result.push(id);
      inResult.add(norm(id));
    }
  }

  for (let index = 0; index < secondary.length; index++) {
    const id = secondary[index];
    if (!keep(id) || inResult.has(norm(id))) continue;

    const resultKeys = result.map(norm);
    let insertAt = -1;
    for (let back = index - 1; back >= 0 && insertAt === -1; back--) {
      const at = resultKeys.indexOf(norm(secondary[back]));
      if (at !== -1) {
        insertAt = at + 1;
        // Both sides added right after the same item: the primary side's
        // additions stay first, so additions read in the order they landed.
        while (
          insertAt < resultKeys.length &&
          !baseSet.has(resultKeys[insertAt]) &&
          !secondarySet.has(resultKeys[insertAt])
        ) {
          insertAt += 1;
        }
      }
    }
    for (let ahead = index + 1; ahead < secondary.length && insertAt === -1; ahead++) {
      const at = resultKeys.indexOf(norm(secondary[ahead]));
      if (at !== -1) insertAt = at;
    }
    if (insertAt === -1) insertAt = result.length;
    result.splice(insertAt, 0, id);
    inResult.add(norm(id));
  }

  return { ids: result, overrodeTheirOrder: weReordered && theyReordered, weReordered };
}

export type GradedBallotSide = { ids: readonly string[]; grades?: BallotGrades };

export type GradedBallotMergeResult = BallotMergeResult & { grades: BallotGrades };

/**
 * `mergeBallotOrders` plus grades (GEO-3729). Each entry's grade is merged three-way too (this
 * edit's where it regraded it, else the published one), and the merged ballot is then sorted into
 * tiers, keeping the merged order within each tier, so every merge comes out tier-ordered.
 *
 * An entry the other side regraded sits where that side put it when its order led the merge. When
 * this edit's order led, it still sits where this edit had it, so it goes to the top of its new
 * tier, as a regrade does. Without grades on any side this is exactly `mergeBallotOrders`.
 */
export function mergeBallots({
  base,
  ours,
  theirs,
}: {
  base: GradedBallotSide;
  ours: GradedBallotSide;
  theirs: GradedBallotSide;
}): GradedBallotMergeResult {
  const { weReordered, ...order } = mergeOrders({ base: base.ids, ours: ours.ids, theirs: theirs.ids });
  const ourGrades = ours.grades ?? NO_GRADES;
  const grades = mergeGrades({
    ids: order.ids,
    base: base.grades ?? NO_GRADES,
    ours: ourGrades,
    theirs: theirs.grades ?? NO_GRADES,
    theirIds: theirs.ids,
  });
  const inOurs = new Set(ours.ids.map(norm));
  const regradedThere = (id: string) =>
    weReordered &&
    inOurs.has(norm(id)) &&
    grades.has(norm(id)) &&
    grades.get(norm(id)) !== (ourGrades.get(norm(id)) ?? undefined);
  return { ...order, ids: sortIntoTiers(order.ids, grades, regradedThere), grades };
}

/** A ballot as read from the index. Timestamps are epoch ms when known. */
export type BallotSnapshot = {
  rankId: string | null;
  orderedEntityIds: readonly string[];
  /** Best debates only; absent means no grades. */
  grades?: BallotGrades;
  /** The rank's `updatedAt`. */
  updatedAtMs?: number | null;
  /** The rank's `createdAt`. */
  createdAtMs?: number | null;
};

/** The published ballot before a publish of ours, and the ballot it sent. */
export type OwnPublishShape = {
  rankId: string;
  orderedEntityIds: string[];
  grades?: BallotGrades;
  baseline: {
    rankId: string | null;
    orderedEntityIds: string[];
    grades?: BallotGrades;
    updatedAtMs?: number | null;
    createdAtMs?: number | null;
  };
};

/**
 * Where a read of the index stands against a publish of ours:
 * - `ours`: it holds exactly the ballot we sent;
 * - `pending`: it still holds the ballot from before we sent (the indexer
 *   hasn't got to our edit yet), or something older than that (a lagging
 *   read), so building on it would drop our edit;
 * - `superseded`: it holds a newer ballot that isn't ours, i.e. another
 *   device's edit landed. Whatever of ours it lacks has to be folded back in
 *   (see `foldOvertakenPublish`).
 *
 * "Newer" is decided on ids and order. Timestamps are only used to rule a read
 * *older* than the baseline (they only move forward): a later `updatedAt`
 * doesn't prove an edit, since it also moves when something merely links to
 * the rank.
 */
export function classifyReadBack(readBack: BallotSnapshot, own: OwnPublishShape): 'ours' | 'pending' | 'superseded' {
  const sameRank = (a: string | null, b: string | null) => (a && b ? norm(a) === norm(b) : a === b);
  const older = (read?: number | null, base?: number | null) => Boolean(read && base && read < base);
  if (
    sameRank(readBack.rankId, own.rankId) &&
    sameBallot(readBack.orderedEntityIds, readBack.grades, own.orderedEntityIds, own.grades)
  ) {
    return 'ours';
  }
  if (
    sameRank(readBack.rankId, own.baseline.rankId) &&
    sameBallot(readBack.orderedEntityIds, readBack.grades, own.baseline.orderedEntityIds, own.baseline.grades)
  ) {
    return 'pending';
  }
  // A read that lost the ballot we built on, or shows an older state of it, or
  // an older rank, is a lagging read, not another device's edit.
  if (!readBack.rankId && own.baseline.rankId) return 'pending';
  if (sameRank(readBack.rankId, own.baseline.rankId) && older(readBack.updatedAtMs, own.baseline.updatedAtMs)) {
    return 'pending';
  }
  if (
    !sameRank(readBack.rankId, own.rankId) &&
    !sameRank(readBack.rankId, own.baseline.rankId) &&
    older(readBack.createdAtMs, own.baseline.createdAtMs)
  ) {
    return 'pending';
  }
  return 'superseded';
}

/**
 * Another device's edit overtook a publish of ours before the index read ours
 * back, so the published ballot may lack our edit (or, if ours lands later,
 * theirs). Fold it back in: the three-way merge of our edit (from its baseline
 * to what we sent) onto the other ballot. Used for the ranker's next edit and
 * for the unpublished draft we hand back; never published on its own.
 */
export function foldOvertakenPublish(
  own: OwnPublishShape,
  publishedIds: readonly string[],
  publishedGrades?: BallotGrades
): GradedBallotMergeResult {
  return mergeBallots({
    base: { ids: own.baseline.orderedEntityIds, grades: own.baseline.grades },
    ours: { ids: own.orderedEntityIds, grades: own.grades },
    theirs: { ids: publishedIds, grades: publishedGrades },
  });
}

export function rankingPublishKey(personalSpaceId: string, blockId: string): string {
  return `${norm(personalSpaceId)}:${norm(blockId)}`;
}

/** Module-level so every hook instance on the page (compose screen, embedded
 *  block, side panel) shares one queue per ballot. */
const queues = new Map<string, Promise<unknown>>();

/** Runs `task` after every task already queued for `key` has finished
 *  (settled either way), so only one publish per ballot is in flight. */
export function enqueueRankingPublish<T>(key: string, task: () => Promise<T>): Promise<T> {
  const previous = queues.get(key) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(task);
  const tail = next.catch(() => undefined);
  queues.set(key, tail);
  void tail.then(() => {
    if (queues.get(key) === tail) queues.delete(key);
  });
  return next;
}

/** Resolves once nothing is queued for `key`, including tasks queued while it waited. */
export async function whenRankingPublishQueueSettles(key: string): Promise<void> {
  for (let tail = queues.get(key); tail; tail = queues.get(key)) await tail;
}

export type RankingIndexOutcome = 'ours' | 'superseded' | 'timeout';

export type RankingIndexResult = {
  outcome: RankingIndexOutcome;
  /** The ballot the deciding read saw (null on timeout). */
  seen: string[] | null;
  /** Its grades (Best debates). */
  seenGrades?: BallotGrades;
};

export type OwnRankingPublish = OwnPublishShape & {
  publishedAtMs: number;
  /** Settles once the index reads back our ballot (`ours`), shows another
   *  device's instead (`superseded`), or the poll budget runs out
   *  (`timeout`). Never rejects. */
  indexed: Promise<RankingIndexResult>;
};

const ownPublishes = new Map<string, OwnRankingPublish>();

export function recordOwnRankingPublish(key: string, publish: OwnRankingPublish): void {
  ownPublishes.set(key, publish);
}

export function getOwnRankingPublish(key: string): OwnRankingPublish | null {
  return ownPublishes.get(key) ?? null;
}

/*
 * Unpublished drafts handed back to the ranker. When another device's edit
 * overtakes one of ours, nothing is published for them: the overtaken edit,
 * folded onto the other ballot, goes back to the screens as unpublished
 * changes, and the ranker publishes it (or not) themselves.
 */
export type UnsavedRankingDraft = {
  /** The ranker's unpublished list. Publishing an edit of it passes this list
   *  itself as `basedOnOrderedIds`: the publish path folds the overtaken edit
   *  and the other device's ballot into the published side, so they meet this
   *  list there, and anything the ranker removes from it stays removed. */
  orderedEntityIds: string[];
  /** The list's grades (Best debates); published with the list as its `basedOnGrades`. */
  grades?: BallotGrades;
  /** The published ballot the list was built on. Only `rebaseUnsavedDraft`
   *  uses it, to read later changes to the published ballot as changes. */
  baseOrderedIds: string[];
  baseGrades?: BallotGrades;
  /** Our overtaken ballot, which may still land after the hand-back. The index
   *  showing it is not a change made elsewhere (the draft already holds it). */
  overtakenOrderedIds: string[];
  overtakenGrades?: BallotGrades;
};

const unsavedDrafts = new Map<string, UnsavedRankingDraft>();
const draftListeners = new Set<() => void>();

export function getUnsavedRankingDraft(key: string): UnsavedRankingDraft | null {
  return unsavedDrafts.get(key) ?? null;
}

export function setUnsavedRankingDraft(key: string, draft: UnsavedRankingDraft | null): void {
  if (draft) unsavedDrafts.set(key, draft);
  else if (!unsavedDrafts.delete(key)) return;
  for (const listener of draftListeners) listener();
}

/** How far two ballots are apart: items in one but not the other. */
function membershipDistance(a: readonly string[], b: readonly string[]): number {
  const aKeys = new Set(a.map(norm));
  const bKeys = new Set(b.map(norm));
  let distance = 0;
  for (const key of aKeys) if (!bKeys.has(key)) distance += 1;
  for (const key of bKeys) if (!aKeys.has(key)) distance += 1;
  return distance;
}

/**
 * Brings a handed-back draft up to date with what is published now, so
 * publishing it never undoes a change made elsewhere since the hand-back.
 * Returns the same draft when nothing moved, null when the published ballot
 * already holds everything in it (published from another tab or device, or
 * re-made by hand), else the draft re-merged onto the published ballot.
 *
 * The published ballot may descend from either side of the overtake: the
 * other device's ballot (the draft's base) or ours, if it landed after. The
 * merge uses whichever of the two it is closer to as its base, so a later
 * edit on either lineage is read as a change, not ours being dropped.
 */
export function rebaseUnsavedDraft(
  draft: UnsavedRankingDraft,
  publishedIds: readonly string[],
  publishedGrades?: BallotGrades
): UnsavedRankingDraft | null {
  if (sameBallot(publishedIds, publishedGrades, draft.orderedEntityIds, draft.grades)) return null;
  if (
    sameBallot(publishedIds, publishedGrades, draft.baseOrderedIds, draft.baseGrades) ||
    sameBallot(publishedIds, publishedGrades, draft.overtakenOrderedIds, draft.overtakenGrades)
  ) {
    return draft;
  }
  const useOvertaken =
    membershipDistance(publishedIds, draft.overtakenOrderedIds) <
    membershipDistance(publishedIds, draft.baseOrderedIds);
  const merged = mergeBallots({
    base: useOvertaken
      ? { ids: draft.overtakenOrderedIds, grades: draft.overtakenGrades }
      : { ids: draft.baseOrderedIds, grades: draft.baseGrades },
    ours: { ids: draft.orderedEntityIds, grades: draft.grades },
    theirs: { ids: publishedIds, grades: publishedGrades },
  });
  if (sameBallot(merged.ids, merged.grades, publishedIds, publishedGrades)) return null;
  return {
    orderedEntityIds: merged.ids,
    grades: merged.grades,
    baseOrderedIds: [...publishedIds],
    baseGrades: publishedGrades,
    overtakenOrderedIds: [...publishedIds],
    overtakenGrades: publishedGrades,
  };
}

export function subscribeUnsavedRankingDrafts(listener: () => void): () => void {
  draftListeners.add(listener);
  return () => draftListeners.delete(listener);
}

export const rankingPublishTiming = {
  initialDelayMs: 500,
  /** Polling the rank itself (one paged entity read). */
  pollIntervalMs: 750,
  /** Polling the block listing for a just-created rank: starts here, backs off. */
  listingPollIntervalMs: 1_000,
  listingPollMaxIntervalMs: 5_000,
  maxPollMs: 60_000,
  /** How long a publish of ours that the index never read back keeps blocking
   *  the next one. Past this, an indexer stall shouldn't lock the ranker out. */
  ownPublishBlocksForMs: 5 * 60 * 1000,
};

export function resetRankingPublishStateForTests(): void {
  queues.clear();
  ownPublishes.clear();
  unsavedDrafts.clear();
}
