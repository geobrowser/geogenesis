/**
 * A person's curator points (GEO-3113).
 *
 * curator-backend keeps one lifetime total per person in Neo4j: bounty payouts plus onboarding
 * steps, with no breakdown by source. Its `GET /user/rewards/:id` answers `{ rewards }` for a
 * personal space id or a person entity id, adding up every record stored under that person's older
 * ids, and answers `0` both for someone with no points and for someone it has never seen. The two
 * cannot be told apart, which is why the profile shows `0` rather than hiding the row.
 *
 * The browser reads it through `/api/curator/points/[spaceId]`, so the backend host stays a
 * server-only setting (`CURATOR_BACKEND_URL`, the same one the community-call routes use).
 */

/** Personal space ids as the app carries them: 32 hex characters, dashes optional. */
export function normalizePointsSpaceId(spaceId: string): string | null {
  const compact = spaceId.replace(/-/g, '').toLowerCase();
  return /^[0-9a-f]{32}$/.test(compact) ? compact : null;
}

/**
 * The total out of curator-backend's `{ rewards }` body.
 *
 * Throws on anything else rather than reading it as zero: now that zero is shown, a malformed
 * answer read as `0` would state something false about the person.
 */
export function parseCuratorRewards(body: unknown): number {
  const rewards = (body as { rewards?: unknown } | null)?.rewards;
  if (typeof rewards !== 'number' || !Number.isFinite(rewards) || rewards < 0) {
    throw new Error('curator-backend returned no usable rewards total');
  }
  return rewards;
}

export function profilePointsQueryKey(spaceId: string) {
  return ['profile-points', spaceId] as const;
}

/** The browser half: the same-origin route, which answers `{ points }` or a non-2xx status. */
export async function fetchProfilePoints(spaceId: string, signal?: AbortSignal): Promise<number> {
  const res = await fetch(`/api/curator/points/${encodeURIComponent(spaceId)}`, { signal });
  if (!res.ok) {
    throw new Error(`points lookup failed (${res.status})`);
  }
  const body: unknown = await res.json();
  const points = (body as { points?: unknown } | null)?.points;
  if (typeof points !== 'number' || !Number.isFinite(points) || points < 0) {
    throw new Error('points lookup returned no usable total');
  }
  return points;
}
