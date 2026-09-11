import { CLAIM_TYPE_ID } from '~/core/claims/ontology';
import { DEBATE_TYPE_ID } from '~/core/debates/ontology';

import { EXPLORE_ENTITY_TYPE_IDS, EXPLORE_PAGE_SIZE } from './explore-constants';

/**
 * Read-time diversity cap for the "Best" feed (GEO-2690).
 *
 * Measured on production, Best sort: the first screen was 100% Claim, 110 items were
 * 78% Claim, and only 2 of the 12 explore types appeared at all. The intended lever —
 * `entity_type_weights` in gaia — cannot fix it: claims lead news by >4 score units on
 * the participation/comment terms, while the schema floors a weight at 0.1
 * (`ln(0.1) ≈ -2.30`, about 29 hours of freshness equivalent). That floor is a
 * deliberate PRD guardrail, so the scores cannot be made to produce a mix.
 *
 * This reorders at read time instead, which is independent of the scoring model: cap how
 * many items of one type may appear consecutively, and pull the next highest-ranked item
 * of another type up into the gap. Ranking still decides *what* is in the feed and
 * broadly in what order — it just stops deciding that one type owns the whole screen.
 *
 * Nothing is dropped and nothing is reordered across pages: see
 * `explore-window-cursor` for how the over-fetched window is paged.
 */

function normId(id: string): string {
  return id.replace(/-/g, '').toLowerCase();
}

/**
 * At most this many consecutive items may share a type. 3 yields a 3:1 worst-case ratio
 * (75% of a screen), which is the most one type can hold when off-type items are
 * available — a large move from the measured 100%, without shuffling the ranking so hard
 * that "Best" stops meaning anything.
 */
export const EXPLORE_DIVERSITY_MAX_RUN = 3;

/**
 * How many ranked items to fetch per window, as a multiple of the page size.
 *
 * This is sized from the measurement, not picked round. News stories only start
 * appearing around rank 31 (the longest unbroken claim run was 30), and run ~30% of
 * ranks 30-110. Filling 22 slots under a run cap of 3 needs
 * `floor(22 / (3 + 1)) = 5` off-type items — floor, not ceil, because the last run on a
 * screen has nothing after it to separate from:
 *
 *   * 2x (44 items) supplies roughly 4 — just short, so the cap would keep bottoming out.
 *   * 3x (66 items) supplies roughly 11 — comfortably enough.
 *
 * So 3 is the smallest multiplier that actually delivers a mix on the first screen.
 * Raising it buys deeper variety at a proportional payload cost.
 */
export const EXPLORE_DIVERSITY_SCAN_MULTIPLIER = 3;

export const EXPLORE_DIVERSITY_WINDOW_SIZE = EXPLORE_PAGE_SIZE * EXPLORE_DIVERSITY_SCAN_MULTIPLIER;

/**
 * Types that lose every classification tie, least specific last.
 *
 * Deliberately separate from the menu order. This priority used to *be* `EXPLORE_ENTITY_TYPES` in
 * its declared order, which worked only because Debate and Claim happened to sit at the bottom of
 * that list. GEO-2790 moved them to the top so the default boxes read first — a presentational
 * change that silently inverted this one, reclassifying a Claim-and-Episode entity as a Claim and
 * letting it *extend* a claim run rather than break one. The two orders answer different questions
 * and are now written down separately.
 */
const CLASSIFIES_LAST = [DEBATE_TYPE_ID, CLAIM_TYPE_ID];

/**
 * Classification priority: one deterministic type per item, most specific first.
 *
 * Entities carry several `types` relations and the relation order is not meaningful, so the run cap
 * needs to pick one. Everything the menu knows about, in menu order, except the types above — which
 * go last so an entity that is both a Claim and something more specific is classified as the
 * something more specific. That is the more informative label and the safer default here: such an
 * item can break a claim run instead of extending one.
 *
 * Membership is still derived, so a type added to the menu is classifiable without a second edit;
 * only the ordering intent is stated by hand.
 */
const TYPE_PRIORITY = [...EXPLORE_ENTITY_TYPE_IDS.filter(id => !CLASSIFIES_LAST.includes(id)), ...CLASSIFIES_LAST].map(
  normId
);

/** Types the feed shows but that carry no useful signal for diversity. */
export const UNTYPED_DIVERSITY_KEY = '';

export function exploreItemTypeKey(item: { types: readonly { id: string }[] }): string {
  if (item.types.length === 0) return UNTYPED_DIVERSITY_KEY;
  const present = new Set(item.types.map(type => normId(type.id)));
  for (const id of TYPE_PRIORITY) {
    if (present.has(id)) return id;
  }
  // Not on the explore whitelist (the activity feed sends no type filter at all). Any
  // stable key will do; the first relation is as good as another and keeps like with like.
  return normId(item.types[0].id);
}

/**
 * Reorder a ranked list so no more than `maxRun` consecutive items share a type.
 *
 * Greedy and order-preserving within a type: once a run is full, the highest-ranked item
 * of any other type is promoted, so demotions are always the minimum needed to break the
 * run. Two properties matter more than the exact heuristic:
 *
 *   * **Nothing is dropped.** When no off-type item remains the run is allowed to
 *     continue, rather than truncating the page or leaving a hole. A single-type feed
 *     (the type filter narrowed to one) therefore comes back in its original order.
 *   * **It is a pure function of the input list.** The window can be re-derived on a
 *     later request and sliced deeper without items repeating or going missing.
 */
export function applyDiversityCap<T>(
  items: readonly T[],
  keyOf: (item: T) => string,
  maxRun: number = EXPLORE_DIVERSITY_MAX_RUN
): T[] {
  if (maxRun <= 0 || items.length <= maxRun) return [...items];

  const remaining = items.slice();
  const ordered: T[] = [];
  let runKey: string | null = null;
  let runLength = 0;

  while (remaining.length > 0) {
    let index = 0;
    if (runKey !== null && runLength >= maxRun) {
      const promoted = remaining.findIndex(item => keyOf(item) !== runKey);
      // -1 means every remaining item is the same type: extend the run rather than drop.
      if (promoted >= 0) index = promoted;
    }

    const [picked] = remaining.splice(index, 1);
    const key = keyOf(picked);
    if (key === runKey) {
      runLength += 1;
    } else {
      runKey = key;
      runLength = 1;
    }
    ordered.push(picked);
  }

  return ordered;
}

/**
 * At most this many items from one space may appear in any `EXPLORE_PAGE_SIZE` consecutive
 * items — one screen (GEO-2841).
 *
 * Sized from two measurements on the same query, two days apart. On 2026-09-08 the
 * Relationships space held **14 of the top 20** and 28 of the top 50; on 2026-09-10, after
 * the debate-tag gate landed, still **12 of 20** and 24 of 50. So this is not a batch working
 * its way out of the feed, and the ranking will not resolve it: `rankingScore` has no decay
 * term at all, and the participation those claims carry never erodes.
 *
 * **5, not the 4 that was proposed, because 4 is not reachable.** The bound here is supply,
 * not the algorithm. The 66-row window measured on 2026-09-10 holds six spaces —
 * 38 / 14 / 6 / 4 / 3 / 1 — so the most a page can draw at `q` per space is
 * `sum(min(count, q))`:
 *
 *   * q=3 -> 16 items, six short of a 22-slot page
 *   * q=4 -> 20 items, two short
 *   * q=5 -> 23 items, the first value that fills a page at all
 *
 * At q=4 the quota would be silently violated on every single page, because the alternative
 * is a short screen. 5 is therefore the tightest honest setting for the feed as it is today.
 * Reaching 4 needs *more spaces in the window*, not a smaller number here — either a deeper
 * scan (GEO-2853 option 1, at proportional payload cost) or more spaces publishing
 * debate-tagged claims.
 */
export const EXPLORE_SPACE_MAX_PER_PAGE = 5;

/**
 * The space a feed item is shown in. Unlike {@link exploreItemTypeKey} there is nothing to
 * classify: a card is rendered in exactly one space, and that is the one crowding the screen.
 */
export function exploreItemSpaceKey(item: { spaceId: string }): string {
  return normId(item.spaceId);
}

/**
 * Reorder a ranked list so no `groupSize` consecutive items hold more than `quota` from one
 * space, *while other spaces still have items to offer*. Nothing is dropped — an item over
 * quota is deferred, and reappears once the window has moved past enough of its space-mates.
 *
 * The qualifier is not hedging, it is arithmetic. `quota x distinct spaces` has to reach
 * `groupSize` for the quota to be satisfiable at all, and each space has to actually supply
 * its share; when it cannot, this emits the best-ranked remaining item rather than leaving
 * the screen short. A feed with one space and a hard quota would otherwise be empty. See
 * `EXPLORE_SPACE_MAX_PER_PAGE` for the measured numbers that set the default.
 *
 * Separate from {@link applyDiversityCap} on purpose, because they bound different things and
 * only one of them addresses the reported problem:
 *
 *   * `applyDiversityCap` bounds a **run** of one *type*. A space holding 12 of 20 satisfies
 *     it completely as long as those 12 are interleaved — which, measured, they are. It also
 *     keys on type, so it says nothing about spaces at all, and with every row in the top 50
 *     typed `Claim` its key is constant and it is a no-op.
 *   * this bounds the **share** held by one *space* over a window.
 *
 * Applied *after* the type cap in `fetchExploreFeed`, so the space guarantee is the one that
 * holds outright. That order can locally weaken the type cap's run guarantee once the type cap
 * has real input again (GEO-2853) — the trade is deliberate: an over-long run of one type is
 * an aesthetic complaint, one space owning the screen is the bug that was reported.
 */
export function applyPerSpaceQuota<T>(
  items: readonly T[],
  keyOf: (item: T) => string,
  quota: number = EXPLORE_SPACE_MAX_PER_PAGE,
  groupSize: number = EXPLORE_PAGE_SIZE
): T[] {
  if (quota <= 0 || groupSize <= 1 || items.length <= quota) return [...items];

  const remaining = items.slice();
  const ordered: T[] = [];

  while (remaining.length > 0) {
    // The trailing window the next item joins. Requiring `< quota` here means that after it is
    // appended, no `groupSize` window holds more than `quota` of its space.
    const trailing = ordered.slice(Math.max(0, ordered.length - (groupSize - 1)));
    const counts = new Map<string, number>();
    for (const item of trailing) {
      const key = keyOf(item);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    // Highest-ranked item still under quota. `remaining` is in rank order and stays that way,
    // so this preserves the ranking wherever the quota does not bind.
    let index = remaining.findIndex(item => (counts.get(keyOf(item)) ?? 0) < quota);
    // -1 means every remaining item is from a space already at quota: emit the best of them
    // rather than dropping or stalling. Reachable whenever the tail of the window is one space,
    // which is exactly the case being fixed.
    if (index < 0) index = 0;

    const [picked] = remaining.splice(index, 1);
    ordered.push(picked);
  }

  return ordered;
}

/** Largest share one key holds in any `groupSize` window — the property the quota bounds. */
export function largestWindowShare<T>(
  items: readonly T[],
  keyOf: (item: T) => string,
  groupSize: number = EXPLORE_PAGE_SIZE
): number {
  let largest = 0;
  for (let start = 0; start < items.length; start += 1) {
    const counts = new Map<string, number>();
    for (const item of items.slice(start, start + groupSize)) {
      const key = keyOf(item);
      const next = (counts.get(key) ?? 0) + 1;
      counts.set(key, next);
      if (next > largest) largest = next;
    }
  }
  return largest;
}

/** Longest run of one type in a list — the property the cap exists to bound. */
export function longestTypeRun<T>(items: readonly T[], keyOf: (item: T) => string): number {
  let longest = 0;
  let runKey: string | null = null;
  let runLength = 0;
  for (const item of items) {
    const key = keyOf(item);
    if (key === runKey) runLength += 1;
    else {
      runKey = key;
      runLength = 1;
    }
    if (runLength > longest) longest = runLength;
  }
  return longest;
}
