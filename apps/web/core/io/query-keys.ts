function normalizeSpaceIds(spaceIds: string[]) {
  return [...new Set(spaceIds.filter(Boolean))].sort();
}

export function profilesBySpaceIdsQueryKey(spaceIds: string[]) {
  return ['profiles-by-space-ids', normalizeSpaceIds(spaceIds)] as const;
}

export function spacesByIdsQueryKey(spaceIds: string[]) {
  return ['spaces-by-ids', normalizeSpaceIds(spaceIds)] as const;
}
