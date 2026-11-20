import { IdUtils } from '@geoprotocol/geo-sdk/lite';

import type { Metadata } from 'next';

import { CANONICAL_SITE } from '~/core/canonical-site';
import { CLAIM_TYPE_ID } from '~/core/claims/ontology';
import { ID } from '~/core/id';
import { isHiddenEntity } from '~/core/moderation/hidden';
import type { Entity } from '~/core/types';
import { normId } from '~/core/utils/norm-id';
import { entityHomeSpaceId, placingSpaceIds } from '~/core/utils/space/entity-home-space';
import { NavUtils } from '~/core/utils/utils';

import { cachedFetchEntity, cachedFetchEntityPage } from './cached-fetch-entity';

function isClaim(entity: Pick<Entity, 'types'>): boolean {
  return entity.types.some(type => ID.equals(type.id, CLAIM_TYPE_ID));
}

/** The entity without the spaces that mark it Hidden, whose pages 404, so neither target can be one. */
function withoutHiddenSpaces<T extends Pick<Entity, 'spaces' | 'values'>>(entity: T): T {
  const hidden = new Set(
    entity.values.filter(value => isHiddenEntity({ values: [value] })).map(value => normId(value.spaceId))
  );
  if (hidden.size === 0) return entity;
  return {
    ...entity,
    spaces: entity.spaces.filter(spaceId => !hidden.has(normId(spaceId))),
    values: entity.values.filter(value => !hidden.has(normId(value.spaceId))),
  };
}

/** A claim record tab, or the overview when absent. */
export type ClaimRecordSubPath = 'debates' | 'claims' | 'topics' | 'sources';

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
  const visible = entity ? withoutHiddenSpaces(entity) : null;
  // Only a space that places the claim: with every copy hidden, the fallback would be a link-only space.
  const home = visible && placingSpaceIds(visible).length > 0 ? entityHomeSpaceId(visible) : null;
  if (!home) return {};

  return {
    alternates: { canonical: `${CANONICAL_SITE}${NavUtils.toEntity(home, entityId)}${subPath ? `/${subPath}` : ''}` },
  };
}
