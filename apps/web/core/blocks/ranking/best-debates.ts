// Best debates ranking (GEO-3591). The block id is set once GEO-3685 creates the block.
export const DEBATES_SPACE_ID = '9284477c8fe746368698994e2e517b32';
export const DEBATE_TYPE_ID = 'fd51f93520634617be397b672b23364c';
export const BEST_DEBATES_BLOCK_ID: string | null = null;
// Flipped in the GEO-3681 cutover release; until then copy promises nothing about the feed.
export const BEST_DEBATES_RANKING_LIVE = false;
/**
 * When Debates members' downvotes start counting as push-downs, in epoch seconds (GEO-3679). Must
 * equal gaia's `ranking_pushdown_since` (GEO-3681): gaia only counts downvotes with
 * `voted_at >= ranking_pushdown_since`, so the web only shows and clears those. Null until phase 1
 * ships: the pushed-down list stays empty and only this session's own push-downs show.
 */
export const BEST_DEBATES_PUSHDOWN_SINCE: number | null = null;
