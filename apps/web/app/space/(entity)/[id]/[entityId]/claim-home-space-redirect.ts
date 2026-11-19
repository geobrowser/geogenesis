import { IdUtils } from '@geoprotocol/geo-sdk/lite';

import type { Metadata } from 'next';

import { redirect } from 'next/navigation';

import { CANONICAL_SITE } from '~/core/canonical-site';
import { CLAIM_TYPE_ID } from '~/core/claims/ontology';
import { ID } from '~/core/id';
import { isHiddenEntity } from '~/core/moderation/hidden';
import type { Entity } from '~/core/types';
import { entityHomeSpaceId, placingSpaceIds, resolveEntitySpaceId } from '~/core/utils/space/entity-home-space';
import { NavUtils } from '~/core/utils/utils';

import { cachedFetchEntity, cachedFetchEntityPage } from './cached-fetch-entity';

type SearchParams = { [key: string]: string | string[] | undefined };

function isClaim(entity: Pick<Entity, 'types'>): boolean {
  return entity.types.some(type => ID.equals(type.id, CLAIM_TYPE_ID));
}

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
 * The claim's home-space URL when `spaceId` holds none of its content, else null (GEO-3802).
 * The target always places the claim, so it cannot loop. `entity` needs values from every space.
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
 * 307s a claim page to its home space when the route's space only links to it. `routeEntity` is the
 * page's space-scoped read; the unscoped fetch runs only when that read doesn't place the claim.
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
  if (!isClaim(routeEntity)) return;
  if (placingSpaceIds(routeEntity).some(placing => ID.equals(placing, spaceId))) return;

  const entity = await cachedFetchEntity(routeEntity.id).catch(() => null);
  const target = claimHomeSpaceRedirectTarget({ entity, spaceId, searchParams, subPath });
  if (target) redirect(target);
}

/**
 * A claim page's canonical URL: the same tab in the claim's home space, one URL for every space that
 * names it. Empty for anything that is not a claim, or when the unscoped read fails.
 */
export async function claimCanonicalMetadata({
  params,
  subPath,
}: {
  params: Promise<{ id: string; entityId: string }>;
  subPath?: ClaimRecordSubPath;
}): Promise<Metadata> {
  const { id: spaceId, entityId } = await params;
  if (!IdUtils.isValid(spaceId) || !IdUtils.isValid(entityId)) return {};

  const routeEntity = (await cachedFetchEntityPage(entityId, spaceId))?.entity;
  if (!routeEntity || isHiddenEntity(routeEntity) || !isClaim(routeEntity)) return {};

  const entity = await cachedFetchEntity(entityId).catch(() => null);
  const home = entity ? entityHomeSpaceId(entity) : null;
  if (!home) return {};

  return {
    alternates: { canonical: `${CANONICAL_SITE}${NavUtils.toEntity(home, entityId)}${subPath ? `/${subPath}` : ''}` },
  };
}
