import { AVAILABLE_CARD_HEIGHT_PX } from '~/partials/community-tab/bounty-card-layout';

/**
 * How the board lays itself out, apart from the cards that fill it.
 *
 * Its own module, with no `'use client'`, because `app/bounties/loading.tsx` is a Server Component
 * and `BountyBoardSkeleton` puts {@link BOARD_GRID_CLASS} straight into a `className`. Read out of
 * `board-bounty-card.tsx` — a client module — the class arrived as a client reference and the
 * loading grid rendered with no grid at all until hydration replaced it.
 *
 * `board-bounty-card.tsx` re-exports both, so nothing that already imports them from there had to
 * change.
 */

/**
 * The board mixes statuses in one grid, so every card gets the same HEIGHT — the available card's,
 * the tallest of the three. Width is fluid: cards fill whatever column the grid gives them (a fixed
 * width is what put the Community-tab grids one column short; see bounty-card's cardStyle).
 */
export const BOARD_CARD_HEIGHT_PX = AVAILABLE_CARD_HEIGHT_PX;

/** Same column threshold as the Community tab's available grid. */
export const BOARD_GRID_CLASS = 'grid grid-cols-[repeat(auto-fill,minmax(min(340px,100%),1fr))] gap-4';
