import { redirect } from 'next/navigation';

import { CLAIM_TYPE_ID } from '~/core/claims/ontology';
import { ID } from '~/core/id';
import type { Entity } from '~/core/types';
import { placingSpaceIds, resolveEntitySpaceId } from '~/core/utils/space/entity-home-space';
import { NavUtils } from '~/core/utils/utils';

import { cachedFetchEntity } from './cached-fetch-entity';

type SearchParams = { [key: string]: string | string[] | undefined };

/** A claim record tab, or the overview when absent. */
export type ClaimRecordSubPath = 'debates' | 'claims' | 'topics' | 'sources';

function queryString(searchParams: SearchParams): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (value === undefined) continue;
    for (const item of Array.isArray(value) ? value : [value]) params.append(key, item);
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

/**
 * Where a claim page opened under `spaceId` should go instead, or null to stay.
 *
 * Every read on the claim page (counts, the viewer's vote, geo-chat's row, the record tabs) is
 * keyed on the URL's space, so a space that only links to the claim (a Topics relation, say)
 * renders it with no votes, and a vote cast there lands where nothing else reads it (GEO-3802).
 * `resolveEntitySpaceId` keeps the URL's space whenever the claim holds content there, so a claim
 * that lives in two spaces stays put in both, and the target is always a space that places the
 * claim, which is what rules out a loop.
 *
 * `entity` must carry its values from every space: a value list scoped to `spaceId` cannot say
 * where else the claim lives. Edit mode never redirects, so an editor can still add the claim to
 * the space they opened it in.
 */
export function claimHomeSpaceRedirectTarget({
  entity,
  spaceId,
  searchParams,
  subPath,
}: {
  entity: Pick<Entity, 'id' | 'spaces' | 'values'> | null;
  spaceId: string;
  searchParams: SearchParams;
  subPath?: ClaimRecordSubPath;
}): string | null {
  if (!entity || searchParams.edit === 'true') return null;

  const home = resolveEntitySpaceId(entity, spaceId);
  if (ID.equals(home, spaceId)) return null;

  return `${NavUtils.toEntity(home, entity.id)}${subPath ? `/${subPath}` : ''}${queryString(searchParams)}`;
}

/**
 * Redirects (307) a claim page to its home space when the route's space only links to it.
 *
 * `routeEntity` is the page's own space-scoped read. When it already places the claim in the
 * route's space, which is every ordinary claim page, nothing more is fetched. Only a link-only URL
 * pays for the unscoped read that says where the claim does live. A failed read stays put.
 */
export async function redirectClaimToHomeSpace({
  routeEntity,
  spaceId,
  searchParams,
  subPath,
}: {
  routeEntity: Pick<Entity, 'id' | 'types' | 'values'> | null | undefined;
  spaceId: string;
  searchParams: SearchParams;
  subPath?: ClaimRecordSubPath;
}): Promise<void> {
  if (!routeEntity || searchParams.edit === 'true') return;
  if (!routeEntity.types.some(type => ID.equals(type.id, CLAIM_TYPE_ID))) return;
  if (placingSpaceIds(routeEntity).some(placing => ID.equals(placing, spaceId))) return;

  const entity = await cachedFetchEntity(routeEntity.id).catch(() => null);
  const target = claimHomeSpaceRedirectTarget({ entity, spaceId, searchParams, subPath });
  if (target) redirect(target);
}
