/**
 * Width of a right-edge side panel — the entity side panel and the Comments panel
 * in its overlay presentation. They open in the same places (a comment button on an
 * entity row, then an author's name from inside that panel), so a viewer sees them
 * as the same surface and any difference in width reads as a bug.
 *
 * Shared as a constant rather than repeated so the two can't drift apart again.
 * Note this is the overlay width only: docked in the debates feed, the Comments
 * panel is a column beside JoinDebatePanel and DebateClaimsPanel and matches those
 * at 360px instead.
 */
export const SIDE_PANEL_WIDTH_CLASS = 'w-[min(600px,100vw)]';
