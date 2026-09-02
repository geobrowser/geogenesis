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
