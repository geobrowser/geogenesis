import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { redirect } from 'next/navigation';

import { fetchCollectionItemsForBlocks } from '~/core/blocks/data/fetch-collection-items';
import type { Tabs } from '~/core/state/editor/editor-provider';
import type { Entity, Relation, TabEntity } from '~/core/types';
import { Entities } from '~/core/utils/entity';
import { Spaces } from '~/core/utils/space';
import { NavUtils, sortRelations } from '~/core/utils/utils';

import { cachedFetchSpace } from '~/app/space/[id]/cached-fetch-space';

import { cachedFetchEntitiesBatch, cachedFetchEntityPage } from './cached-fetch-entity';

export type EntityPageData = {
  id: string;
  spaceId: string;
  serverAvatarUrl: string | null;
  serverCoverUrl: string | null;
  serverSpaces: string[];
  deterministicSpaceId: string | null;
  tabs: Tabs;
  tabEntities: TabEntity[];
  tabRelations: Relation[];
  relationEntityRelations: Relation[];
  blockRelations: Relation[];
  blocks: Entity[];
  initialCollectionItems: Record<string, Entity[]>;
};

/**
 * Loads the data needed to render an entity page: tabs and their blocks,
 * top-level blocks, collection items, and avatar/cover urls. Redirects to
 * the space front page if this entity is the page entity for an unrelated
 * space.
 *
 * Shared by `default-entity-page` and `post-entity-page` so the two stay
 * in sync; consumers can derive any view-specific flags from the returned
 * data at the call site.
 */
export async function fetchEntityPageData(
  spaceId: string,
  entityId: string,
  options?: { canClaimTopic?: boolean }
): Promise<EntityPageData> {
  const entityPage = await cachedFetchEntityPage(entityId, spaceId);

  const entity = entityPage?.entity;
  const relationEntityRelations = entityPage?.relations ?? [];
  const spaces = entity?.spaces ?? [];
  const deterministicSpaceId = Spaces.getDeterministicSpaceId(spaces, spaceId);

  /**
   * Only redirect to the space front page if this entity is the page
   * entity for the current space, not a SPACE_TYPE from another space.
   *
   * Skip the redirect when the entity is a claimable topic so the user lands
   * on the topic entity page where the "Claim topic" button lives. Without
   * this, claimed topics (which have SPACE_TYPE and a matching space) would
   * bounce the user away before the button can render.
   */
  if (!options?.canClaimTopic && entity?.types.map(t => t.id).includes(SystemIds.SPACE_TYPE) && deterministicSpaceId) {
    const space = await cachedFetchSpace(deterministicSpaceId);
    if (space?.entity?.id === entityId && !Spaces.hasExternalTopic(space)) {
      redirect(NavUtils.toSpace(deterministicSpaceId));
    }
  }

  const tabRelations = entity?.relations.filter(r => r.type.id === SystemIds.TABS_PROPERTY) ?? [];
  const tabIds = sortRelations(tabRelations).map(r => r.toEntity.id);

  // @TODO: For performance can we wait to fetch tabs until we're on the client?
  const fetchedTabEntities = tabIds.length > 0 ? await cachedFetchEntitiesBatch(tabIds, spaceId) : [];

  // Re-order entities to match the sorted tabIds order (batch fetch doesn't preserve order)
  const tabEntityMap = new Map(fetchedTabEntities.map(e => [e.id, e]));
  const tabEntities = tabIds.map(id => tabEntityMap.get(id)).filter((e): e is NonNullable<typeof e> => e != null);

  // @TODO(migration): We can query blocks from entities now
  const tabBlocks = await Promise.all(
    tabEntities.map(async tabEntity => {
      const tabBlockRelations = tabEntity?.relations.filter(r => r.type.id === SystemIds.BLOCKS) ?? [];
      const tabBlockEntityIds = tabBlockRelations.map(r => r.toEntity.id);
      const tabBlockRelationEntityIds = tabBlockRelations.map(r => r.entityId).filter(Boolean);
      const allTabBlockIds = [...new Set([...tabBlockEntityIds, ...tabBlockRelationEntityIds])];

      return allTabBlockIds.length > 0 ? await cachedFetchEntitiesBatch(allTabBlockIds) : [];
    })
  );

  const tabs: Tabs = {};

  tabEntities.forEach((tabEntity, index) => {
    tabs[tabEntity.id] = {
      entity: tabEntity,
      blocks: tabBlocks[index],
    };
  });

  const serverAvatarUrl = Entities.avatar(entity?.relations);
  const serverCoverUrl = Entities.cover(entity?.relations);

  const blockRelations = entity?.relations.filter(r => r.type.id === SystemIds.BLOCKS);
  const blockEntityIds = blockRelations?.map(r => r.toEntity.id) ?? [];
  const blockRelationEntityIds = blockRelations?.map(r => r.entityId).filter(Boolean) ?? [];
  const allBlockIds = [...new Set([...blockEntityIds, ...blockRelationEntityIds])];

  const blocks = allBlockIds.length > 0 ? await cachedFetchEntitiesBatch(allBlockIds) : [];

  const allBlocks = [...blocks, ...tabBlocks.flat()];
  const initialCollectionItems = await fetchCollectionItemsForBlocks(allBlocks, cachedFetchEntitiesBatch, spaceId);

  return {
    id: entityId,
    spaceId,
    serverAvatarUrl,
    serverCoverUrl,
    serverSpaces: spaces,
    deterministicSpaceId: deterministicSpaceId ?? null,

    tabs,
    tabEntities,
    tabRelations,

    relationEntityRelations,

    blockRelations: blockRelations ?? [],
    blocks,
    initialCollectionItems,
  };
}
