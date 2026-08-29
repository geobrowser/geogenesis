import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { uuidToHex } from '~/core/id/normalize';
import { getTopRankedSpaceId } from '~/core/utils/space/space-ranking';

/**
 * Which of a claim's spaces it belongs to, for debates.
 *
 * Lifted out of the rematch picker for GEO-2704: the graph-backed tail of the side panel's list
 * has to answer the same question, and answering it twice is how the two surfaces would drift.
 *
 * The structural subset each takes is the picker's claim projection; a full `Entity` satisfies it.
 */
type ClaimSpaces = {
  spaces: string[];
  values?: Array<{ isDeleted?: boolean; property: { id: string }; spaceId: string; value: string }>;
};

/**
 * The space a claim actually lives in.
 *
 * Everything the picker does with a claim is scoped to one space — the response is published
 * against it, geo-chat keys its claim row and readiness on it, and the "Is factual" value that
 * decides the response kind is read from it. Getting it wrong means responding in one space and
 * asking to debate in another, which the server answers with "respond to this claim in this space
 * before enabling debate readiness".
 *
 * `entity.spaces` can't answer it: it is ordered by a fixed space ranking and counts every space
 * holding *any* value or even an inbound relation, so `spaces[0]` is a space that merely mentions
 * the claim whenever that space outranks the claim's own — a Podcasts claim cited from Root or
 * Crypto resolves to those. Prefer the spaces where the claim is actually named, which is how the
 * entity side panel scopes the same entity.
 *
 * `canPublishIn`, where given, is consulted before the ranking. A claim named in both a personal
 * space and a public one is a real case — a debater publishes into their own space and a curator
 * later adds the claim to a shared one — and the space ranking has no opinion on which to pick:
 * neither is in its table, so the tie falls to array order. Picking the personal space there loses a
 * claim that is perfectly debatable in the public one, since the home space is exactly what decides
 * where the debate is published. So: rank among the spaces that could receive it, and fall back to
 * the plain ranking when none can, which leaves the claim to be filtered out on its merits rather
 * than resolving to no space at all.
 */
export function claimHomeSpaceId(entity: ClaimSpaces, canPublishIn?: (spaceId: string) => boolean): string | null {
  const named = [...claimNamedSpaceIds(entity)];
  const publishable = canPublishIn ? (ids: string[]) => ids.filter(canPublishIn) : (ids: string[]) => ids;

  return (
    getTopRankedSpaceId(publishable(named)) ??
    getTopRankedSpaceId(named) ??
    getTopRankedSpaceId(publishable(entity.spaces)) ??
    getTopRankedSpaceId(entity.spaces) ??
    null
  );
}

/** The spaces a claim is actually named in — where it lives, as opposed to where it is mentioned. */
export function claimNamedSpaceIds(entity: Pick<ClaimSpaces, 'values'>): Set<string> {
  const namedSpaceIds = new Set<string>();
  for (const value of entity.values ?? []) {
    if (
      value.isDeleted !== true &&
      uuidToHex(value.property.id) === uuidToHex(SystemIds.NAME_PROPERTY) &&
      typeof value.value === 'string' &&
      value.value.trim().length > 0
    ) {
      namedSpaceIds.add(value.spaceId);
    }
  }
  return namedSpaceIds;
}

/**
 * Every space a claim could resolve its home to. The publishability lookup covers all of them, so
 * {@link claimHomeSpaceId} has the types it needs to choose between them rather than choosing first
 * and discovering afterwards that the space it picked can never receive the debate.
 */
export function claimCandidateSpaceIds(entity: ClaimSpaces): string[] {
  return [...new Set([...claimNamedSpaceIds(entity), ...entity.spaces])];
}
