import { ID } from '~/core/id';

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
export function mergeBallotOrders({
  base,
  ours,
  theirs,
}: {
  base: readonly string[];
  ours: readonly string[];
  theirs: readonly string[];
}): BallotMergeResult {
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

  return { ids: result, overrodeTheirOrder: weReordered && theyReordered };
}

/** A ballot as read from the index. Timestamps are epoch ms when known. */
export type BallotSnapshot = {
  rankId: string | null;
  orderedEntityIds: readonly string[];
  /** The rank's `updatedAt`. */
  updatedAtMs?: number | null;
  /** The rank's `createdAt`. */
  createdAtMs?: number | null;
};

/** The published ballot before a publish of ours, and the ballot it sent. */
export type OwnPublishShape = {
  rankId: string;
  orderedEntityIds: string[];
  baseline: {
    rankId: string | null;
    orderedEntityIds: string[];
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
  if (sameRank(readBack.rankId, own.rankId) && sameBallotOrder(readBack.orderedEntityIds, own.orderedEntityIds)) {
    return 'ours';
  }
  if (
    sameRank(readBack.rankId, own.baseline.rankId) &&
    sameBallotOrder(readBack.orderedEntityIds, own.baseline.orderedEntityIds)
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
export function foldOvertakenPublish(own: OwnPublishShape, publishedIds: readonly string[]): BallotMergeResult {
  return mergeBallotOrders({ base: own.baseline.orderedEntityIds, ours: own.orderedEntityIds, theirs: publishedIds });
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

export type RankingIndexOutcome = 'ours' | 'superseded' | 'timeout';

export type RankingIndexResult = {
  outcome: RankingIndexOutcome;
  /** The ballot the deciding read saw (null on timeout). */
  seen: string[] | null;
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
const unsavedDrafts = new Map<string, string[]>();
const draftListeners = new Set<() => void>();

export function getUnsavedRankingDraft(key: string): string[] | null {
  return unsavedDrafts.get(key) ?? null;
}

export function setUnsavedRankingDraft(key: string, orderedEntityIds: string[] | null): void {
  if (orderedEntityIds) unsavedDrafts.set(key, orderedEntityIds);
  else if (!unsavedDrafts.delete(key)) return;
  for (const listener of draftListeners) listener();
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
