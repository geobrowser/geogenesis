import { validateSpaceId } from '~/core/io/rest/validation';

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
/**
 * Normalized, because this entry has three writers and they do not agree on a spelling: the batch
 * loader is handed ids from geo-chat, `useGeoProfile` seeds it with the `spaceId` the REST API
 * answered with, and the claim-response primer uses responder ids from a third payload. REST may
 * return the same bytes with or without dashes (see `validateSpaceId`), so keying on the raw string
 * let one writer's entry sit unread beside another's request for the same person.
 *
 * An id that is not a space id is passed through rather than dropped, so a bad key stays visibly
 * bad instead of silently colliding with every other bad key under `null`.
 */
export function profileBySpaceIdQueryKey(spaceId: string) {
  return ['profile-by-space-id', validateSpaceId(spaceId) ?? spaceId] as const;
}

export function spacesByIdsQueryKey(spaceIds: string[]) {
  return ['spaces-by-ids', normalizeSpaceIds(spaceIds)] as const;
}
