/**
 * The bounty cards' fixed heights.
 *
 * Their own module, with no `'use client'` on it, because the board's loading state is
 * server-rendered and needs them — see `partials/bounties/board-layout.ts`. Every export of a
 * client module is a client reference on the server rather than the value it looks like, so a
 * number read across that boundary arrives as an opaque placeholder and lands in the DOM as one.
 *
 * `bounty-card.tsx` re-exports all three, so nothing that already imports them from there had to
 * change.
 */

export const COMPLETED_CARD_HEIGHT_PX = 143;
export const IN_PROGRESS_CARD_HEIGHT_PX = 110;
export const AVAILABLE_CARD_HEIGHT_PX = 240;
