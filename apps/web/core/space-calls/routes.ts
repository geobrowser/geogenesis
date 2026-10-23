/** A space call's page (GEO-3419). The only place this shape is written down. */
export function spaceCallPath(spaceId: string, callId: string) {
  return `/space/${spaceId}/calls/${callId}`;
}

/** `/space/{id}/calls/{callId}` and anything under it. */
export function isSpaceCallPath(pathname: string): boolean {
  const segments = pathname.split(/[?#]/, 1)[0].split('/').filter(Boolean);
  return segments[0] === 'space' && segments[2] === 'calls' && segments.length > 3;
}
