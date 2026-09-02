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
 * The debates feed at `/space/{id}/debates` is deliberately not in that set. It is a browsing
 * surface, it is where the hub is opened from most often, and closing there would reintroduce the
 * dead end one route down.
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

  // `/space/{id}/debates` — the feed.
  if (withinDebates.length === 0) return false;

  // `/space/{id}/debates/rematches/{sessionId}` is a room; `/rematches` alone is not a route, and
  // treating the bare segment as one would close the hub on a path that renders nothing.
  if (withinDebates[0] === 'rematches') return withinDebates.length > 1;

  // `/space/{id}/debates/{debateId}` — the room itself.
  return true;
}
