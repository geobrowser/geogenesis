/**
 * Whether an Explore debate card plays the debate's moments reel, as the debates app's card does
 * (GEO-3833), instead of the two full recordings.
 *
 * Off unless `NEXT_PUBLIC_DEBATE_CARD_MOMENTS=1`. On in Preview first, and in Production once the
 * reel has been checked on phones and the warehouse counts clip watch time (geobrowser/analytics).
 * It is a build-time value, so flipping it needs a rebuild, not just a redeploy of the same build.
 *
 * Off, every card is the two-tile player it was before. On, a card whose debate has a reel plays
 * it, and a debate with no reel (or a failed read) keeps the two-tile player.
 */
export const DEBATE_CARD_PLAYS_MOMENTS = process.env.NEXT_PUBLIC_DEBATE_CARD_MOMENTS === '1';
