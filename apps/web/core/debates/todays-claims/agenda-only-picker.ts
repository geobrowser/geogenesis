/**
 * GEO-3733. The debate room's claim picker offers only claims a curator has put on a debate agenda.
 * Matches and both positions tabs keep a claim only when an agenda lists it (a space's current one,
 * or one from the six days before), and Explore, Related and "From this debate", which draw from
 * outside any agenda, leave the strip along with the requests behind them.
 *
 * Hidden rather than removed: set this false to bring them back. Typed `boolean` so the branches it
 * gates don't read as dead code. Its own module so the picker's tests can run both ways.
 */
export const AGENDA_ONLY_PICKER: boolean = true;
