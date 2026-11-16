/**
 * GEO-3733, GEO-3775. The debate room's claim picker offers only claims a curator has put on a debate
 * agenda. Matches, both positions tabs and Explore keep a claim only when an agenda lists it (a
 * space's current one, or one from the six days before). Related and "From this debate", which draw
 * from outside any agenda, leave the strip along with the requests behind them.
 *
 * Set this false to bring the full lists back. Typed `boolean` so the branches it gates don't read as
 * dead code. Its own module so the picker's tests can run both ways.
 */
export const AGENDA_ONLY_PICKER: boolean = true;

/**
 * GEO-3775. The Debates side panel's Matches and Explore, and the full-screen hub's lists, offer only
 * agenda claims, by the same rule as the room. A lobby's own Explore is not affected. Apart from
 * `AGENDA_ONLY_PICKER` so either surface can be rolled back alone.
 */
export const AGENDA_ONLY_HUB_PANEL: boolean = true;
