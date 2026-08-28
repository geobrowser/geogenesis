function normalizeSpaceIds(spaceIds: string[]) {
  return [...new Set(spaceIds.filter(Boolean))].sort();
}

export function profilesBySpaceIdsQueryKey(spaceIds: string[]) {
  return ['profiles-by-space-ids', normalizeSpaceIds(spaceIds)] as const;
}

/**
 * One cache entry per profile rather than one per *set* of profiles.
 *
 * Set-keyed caching means adding a single id — the viewer's own space when they respond
 * to a claim — mints a brand new key with no data behind it, so every avatar in the group
 * drops back to a placeholder until a fresh batch request lands. Keyed per id, the ids we
 * already resolved keep rendering and only the new one has to be fetched (and usually not
 * even that, since the viewer's own profile is already cached from the navbar).
 */
export function profileBySpaceIdQueryKey(spaceId: string) {
  return ['profile-by-space-id', spaceId] as const;
}

export function spacesByIdsQueryKey(spaceIds: string[]) {
  return ['spaces-by-ids', normalizeSpaceIds(spaceIds)] as const;
}
