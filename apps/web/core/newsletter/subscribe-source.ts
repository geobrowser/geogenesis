/**
 * Where a signup came from, and the MailerLite group it is filed under.
 *
 * The Explore popup is the first of several entry points, so the surface names itself in the
 * request rather than the route assuming there is only one. Groups are how this account already
 * tracks origin — "Curator Page Subscribe" and "Homepage mailing list" predate this — so a new
 * surface is a line here and a group there, not a change to the route.
 *
 * A closed map, deliberately, and this is the part that matters. The endpoint is an anonymous
 * write, so a free-text group taken from the request body would let anyone file addresses into any
 * group on the account — including ones that existing campaigns send to. Anything not named here
 * is dropped rather than honoured, and the subscribe still happens: an unrecognised source is our
 * bug to fix, and losing someone's signup over it would be the worse outcome.
 *
 * Ids rather than names because MailerLite's subscribe endpoint takes ids, and they are not
 * secret — no reason to spend an environment variable, or to have this work in production and not
 * in preview because one was set in one place. Renaming a group in the dashboard keeps its id, so
 * the label is theirs to change without touching this.
 */
export const SUBSCRIBE_SOURCE_GROUPS = {
  /** The scroll-triggered email capture on /explore (GEO-2925). Group "explore_opt_in". */
  explore: '198826253148489537',
} as const;

export type SubscribeSource = keyof typeof SUBSCRIBE_SOURCE_GROUPS;

/** The group for a source, or `null` for anything we do not recognise. */
export function groupIdForSource(source: unknown): string | null {
  if (typeof source !== 'string') return null;
  return Object.prototype.hasOwnProperty.call(SUBSCRIBE_SOURCE_GROUPS, source)
    ? SUBSCRIBE_SOURCE_GROUPS[source as SubscribeSource]
    : null;
}
