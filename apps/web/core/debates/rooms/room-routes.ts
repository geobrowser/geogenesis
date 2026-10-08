/**
 * Where a debate room lives (GEO-2941). Top-level rather than under a space: a room is scoped to a
 * pair, and the link is bookmarked, pasted into a calendar invite and refreshed.
 */

/** The room URL. The only place this shape is written down. */
export function debateRoomPath(roomId: string) {
  return `/debate/${roomId}`;
}

/** Exactly `/debate/{roomId}`. A sub-route added later is a sibling of the room, not the room. */
export function isDebateRoomPath(pathname: string): boolean {
  const segments = pathname.split(/[?#]/, 1)[0].split('/').filter(Boolean);
  return segments.length === 2 && segments[0] === 'debate';
}

/** The room id in this path, or `null` when it is not a room path. */
export function debateRoomIdFromPath(pathname: string): string | null {
  const segments = pathname.split(/[?#]/, 1)[0].split('/').filter(Boolean);
  return isDebateRoomPath(pathname) ? segments[1] : null;
}
