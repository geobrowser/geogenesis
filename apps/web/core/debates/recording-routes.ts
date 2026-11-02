/**
 * Where a finished debate's public recording viewer lives (GEO-3435): under its space, a sibling of
 * the debate room. geo-chat's "Your debate is ready" email links it (`recording_path` there), and
 * `proxy.ts` sends it on to the debate's own page once the debate is on the graph.
 */

/** The recording viewer URL. The only place this shape is written down. */
export function debateRecordingPath(spaceId: string, debateId: string) {
  return `/space/${spaceId}/debates/${debateId}/recording`;
}

/** The space and debate in this path, or `null` when it is not exactly a recording viewer path. */
export function debateRecordingFromPath(pathname: string): { spaceId: string; debateId: string } | null {
  const [root, spaceId, debates, debateId, recording, ...rest] = pathname
    .split(/[?#]/, 1)[0]
    .split('/')
    .filter(Boolean);
  if (root !== 'space' || debates !== 'debates' || recording !== 'recording' || rest.length > 0) return null;
  if (!spaceId || !debateId) return null;
  return { spaceId, debateId };
}
