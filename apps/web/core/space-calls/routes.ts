/** A space call's page (GEO-3419). The only place this shape is written down. */
export function spaceCallPath(spaceId: string, callId: string) {
  return `/space/${spaceId}/calls/${callId}`;
}

/** A space's Calls tab (GEO-3420). */
export function spaceCallsTabPath(spaceId: string) {
  return `/space/${spaceId}/calls`;
}

/** The schedule form for a new series or one-off, which writes its Community Call entity. */
export function spaceCallScheduleNewPath(spaceId: string) {
  return `/space/${spaceId}/community/new`;
}

/** A call series' schedule form; one-offs included, as each is a Community Call entity too. */
export function spaceCallSeriesEditPath(spaceId: string, seriesId: string) {
  return `/space/${spaceId}/community/${seriesId}/edit`;
}

/** `/space/{id}/calls/{callId}` and anything under it. */
export function isSpaceCallPath(pathname: string): boolean {
  const segments = pathname.split(/[?#]/, 1)[0].split('/').filter(Boolean);
  return segments[0] === 'space' && segments[2] === 'calls' && segments.length > 3;
}
