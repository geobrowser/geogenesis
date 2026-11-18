// Best debates ranking (GEO-3591). The block (GEO-3685) lives on the Debates space home page.
export const DEBATES_SPACE_ID = '9284477c8fe746368698994e2e517b32';
export const DEBATE_TYPE_ID = 'fd51f93520634617be397b672b23364c';
export const BEST_DEBATES_BLOCK_ID: string | null = '1221b258ec204608b0c33d00d6df2c21';
// On since the GEO-3681 cutover (13 Nov 2026): Best follows the ranking, so push-down copy can promise a
// feed effect. Set back to false on a rollback.
export const BEST_DEBATES_RANKING_LIVE = true;
/**
 * When Debates members' downvotes start counting as push-downs, in epoch seconds (GEO-3679). Must
 * equal gaia's `ranking_pushdown_since` (GEO-3681): gaia only counts downvotes with
 * `voted_at >= ranking_pushdown_since`, so the web only shows and clears those. Phase 1 launch:
 * 2026-11-13 13:00 New York (18:00 UTC).
 */
export const BEST_DEBATES_PUSHDOWN_SINCE: number | null = 1794592800;
