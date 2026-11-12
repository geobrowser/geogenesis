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

export const RANKING_PREVIOUS_PUBLISH_PENDING_MESSAGE =
  'Your last ranking change is still saving. Try again in a moment.';

const norm = (id: string) => ID.uuidToHex(id);

export function sameBallotOrder(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, index) => norm(id) === norm(b[index]));
}

/**
 * Three-way merge of ordered ballots.
 *
 * - `base`: the published list the edit was made from.
 * - `ours`: the list this edit wants to publish.
 * - `theirs`: the list published now (another device's edit, or our own
 *   earlier placement the edit was built without).
 *
 * Nothing either side added is lost, and nothing either side removed comes
 * back: an item is kept unless one side removed it from `base`. Our order wins
 * for the items we hold; an item only `theirs` added goes right after its
 * nearest predecessor in `theirs` that survived (else before its nearest
 * survivor that follows, else at the end).
 */
export function mergeBallotOrders({
  base,
  ours,
  theirs,
}: {
  base: readonly string[];
  ours: readonly string[];
  theirs: readonly string[];
}): string[] {
  const baseSet = new Set(base.map(norm));
  const theirSet = new Set(theirs.map(norm));
  const ourSet = new Set(ours.map(norm));

  const result = ours.filter(id => !(baseSet.has(norm(id)) && !theirSet.has(norm(id))));

  for (let index = 0; index < theirs.length; index++) {
    const id = theirs[index];
    const key = norm(id);
    if (baseSet.has(key) || ourSet.has(key)) continue;

    const resultKeys = result.map(norm);
    let insertAt = -1;
    for (let back = index - 1; back >= 0 && insertAt === -1; back--) {
      const at = resultKeys.indexOf(norm(theirs[back]));
      if (at !== -1) insertAt = at + 1;
    }
    for (let ahead = index + 1; ahead < theirs.length && insertAt === -1; ahead++) {
      const at = resultKeys.indexOf(norm(theirs[ahead]));
      if (at !== -1) insertAt = at;
    }
    if (insertAt === -1) insertAt = result.length;
    result.splice(insertAt, 0, id);
  }

  return result;
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

export type OwnRankingPublish = {
  rankId: string;
  orderedEntityIds: string[];
  publishedAtMs: number;
  /** Resolves true once the index reads back exactly this ballot, false if the
   *  poll budget ran out first. Never rejects. */
  indexed: Promise<boolean>;
};

const ownPublishes = new Map<string, OwnRankingPublish>();

/** How long an unindexed publish of ours keeps blocking the next one. Past
 *  this, an indexer stall shouldn't lock the ranker out for good. */
export const OWN_PUBLISH_BLOCKS_FOR_MS = 5 * 60 * 1000;

export function recordOwnRankingPublish(key: string, publish: OwnRankingPublish): void {
  ownPublishes.set(key, publish);
}

export function getOwnRankingPublish(key: string): OwnRankingPublish | null {
  return ownPublishes.get(key) ?? null;
}

export const rankingPublishTiming = {
  initialDelayMs: 500,
  pollIntervalMs: 750,
  maxPollMs: 60_000,
};

export function resetRankingPublishStateForTests(): void {
  queues.clear();
  ownPublishes.clear();
}
