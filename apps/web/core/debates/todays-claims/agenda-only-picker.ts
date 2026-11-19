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
 * agenda claims, by the same rule as the room. Apart from `AGENDA_ONLY_PICKER` so either surface can be rolled back
 * alone.
 */
export const AGENDA_ONLY_HUB_PANEL: boolean = true;

/**
 * GEO-3775. A debate lobby's claims, by the same rule: "In this room", Explore, and the "Disagrees on
 * N" counts and lists drawn from the room's claims. Today's claims is agenda-sourced already. A
 * claim someone is debating right now still names itself on their tile: that is news, not an offer.
 */
export const AGENDA_ONLY_LOBBY: boolean = true;

/**
 * GEO-3775. Within an agenda-only lobby (`AGENDA_ONLY_LOBBY`), whether the hosts' own picks narrow
 * too: the claim lists a host adds with "+", and the claims a host highlights or puts to a room vote.
 * Its own switch because whether a host's curation should be second-guessed is a separate call.
 */
export const AGENDA_ONLY_LOBBY_HOST_LISTS: boolean = true;
