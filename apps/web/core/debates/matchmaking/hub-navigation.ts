/**
 * Whether arriving at this path should close the debates hub (GEO-2788).
 *
 * The hub used to close on every navigation, which made it a dead end: the Claims tab exists to be
 * read, and following a claim from it shut the list you were working through, so coming back meant
 * reopening the hub, returning to the tab and finding your place again. Same for a person's profile.
 *
 * So the rule is inverted — it stays open, and this names the places it must not follow the viewer
 * into. That is the debate room and the rematch room, and only those: both are full-screen, both
 * are somewhere the viewer is *doing* something rather than browsing, and accepting a request walks
 * them straight into one. A panel sitting over a live debate is the case the old blanket close
 * existed for, and it is the case this keeps.
 *
 * The debates feed at `/space/{id}/debates` is deliberately not in that set, and neither is the
 * public recording viewer at `/space/{id}/debates/{debateId}/recording`. Both are browsing
 * surfaces — the feed is where the hub is opened from most often, and the recording page is an
 * ordinary page in the space chrome rather than a takeover. Closing on either would reintroduce
 * the dead end one route down.
 *
 * Dismissal is unaffected and is what makes a persistent panel reasonable: the navbar toggle,
 * Escape, a click outside on desktop, a drag down on mobile.
 */
export function hubClosesOnArrivalAt(pathname: string): boolean {
  const segments = pathname.split('/').filter(Boolean);

  // Every debate surface lives under a space. Anything else — Explore, an entity, a profile — is
  // somewhere the hub is welcome.
  if (segments[0] !== 'space' || segments[2] !== 'debates') return false;

  const withinDebates = segments.slice(3);

  // Exact shapes, not a catch-all on "anything under a debate id".
  // `/space/{id}/debates/{debateId}/recording` is a sibling of the room, and it is a public
  // recording viewer — an ordinary in-layout page like the feed, not the `fixed inset-0` takeover
  // the room is. A catch-all closed the hub there, which is the opposite of the rule this function
  // exists to state, and it would have swallowed every sub-route added under a room from here on.
  //
  // `/space/{id}/debates/rematches/{sessionId}` — a rematch room, and only at that exact depth.
  // `/rematches` alone is not a route, and anything longer is a sibling rather than the room.
  if (withinDebates[0] === 'rematches') return withinDebates.length === 2;

  // `/space/{id}/debates/{debateId}` — the room itself. Length zero is the feed.
  return withinDebates.length === 1;
}
