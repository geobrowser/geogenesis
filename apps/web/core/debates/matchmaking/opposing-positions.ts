/**
 * The sides of a claim opposite the viewer's (GEO-3463), or none when the viewer holds no side. What
 * Schedule, the Matches tab's "someone on the other side" and the "Most people" sort each ask.
 */
export function opposingPositions<T extends { position: boolean }>(
  positions: readonly T[],
  viewerPosition: boolean | null | undefined
): T[] {
  if (typeof viewerPosition !== 'boolean') return [];
  return positions.filter(position => position.position !== viewerPosition);
}
