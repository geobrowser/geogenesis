import { ContentIds, IdUtils, Position, SystemIds } from '@geoprotocol/geo-sdk/lite';

import { type Filter, toGeoFilterState } from '~/core/blocks/data/filters';
import { makeRelationForSourceType } from '~/core/blocks/data/source';
import { getSchemaFromTypeIds } from '~/core/database/entities';
import { ID } from '~/core/id';
import { queryClient } from '~/core/query-client';
import { getRelationForBlockType } from '~/core/state/editor/block-types';
import { E } from '~/core/sync/orm';
import { storage } from '~/core/sync/use-mutate';
import { getRelations, getValues } from '~/core/sync/use-store';
import { store } from '~/core/sync/use-sync-engine';
import type { Property, Relation } from '~/core/types';
import { sortRelations } from '~/core/utils/utils';

type PersonalPostFlowArgs = {
  spaceId: string;
  profileEntityId: string;
  authorDisplayName: string;
};

function pickPublishDateProperty(schema: Property[]): Property | null {
  return schema.find(p => p.id === ContentIds.PUBLISH_DATE_PROPERTY) ?? null;
}

function initialPublishDateValue(dataType: string): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  if (dataType === 'DATE') {
    return `${y}-${m}-${d}`;
  }
  const localMidnightUtc = new Date(y, now.getMonth(), now.getDate());
  return localMidnightUtc.toISOString();
}

function pickAuthorsProperty(schema: Property[]): Property | null {
  return schema.find(p => p.id === ContentIds.AUTHORS_PROPERTY) ?? null;
}

function tabEntityName(tabEntityId: string, spaceId: string): string | null {
  const v = getValues({
    selector: r =>
      r.entity.id === tabEntityId && r.spaceId === spaceId && r.property.id === SystemIds.NAME_PROPERTY && !r.isDeleted,
  })[0];
  const fromValue = v?.value?.trim();
  if (fromValue) return fromValue;
  const rel = getRelations({
    selector: r =>
      r.toEntity.id === tabEntityId && r.type.id === SystemIds.TABS_PROPERTY && r.spaceId === spaceId && !r.isDeleted,
  })[0];
  return rel?.toEntity.name?.trim() ?? null;
}

function postsQueryBlockExists(tabEntityId: string, spaceId: string): boolean {
  const blocks = getRelations({
    selector: r =>
      r.fromEntity.id === tabEntityId && r.type.id === SystemIds.BLOCKS && r.spaceId === spaceId && !r.isDeleted,
  });
  for (const br of blocks) {
    const bid = br.toEntity.id;
    const title =
      getValues({
        selector: v =>
          v.entity.id === bid && v.spaceId === spaceId && v.property.id === SystemIds.NAME_PROPERTY && !v.isDeleted,
      })[0]?.value?.trim() ?? br.toEntity.name?.trim();
    if (title === 'Posts') {
      return true;
    }
  }
  return false;
}

function createProfilePageTabAtEnd(
  profileEntityId: string,
  spaceId: string,
  tabTitle: string,
  lastPosition: string | null
): string {
  const tabEntityId = ID.createEntityId();
  const tabsRelationId = ID.createEntityId();
  const tabsRelationEntityId = ID.createEntityId();
  const typesRelationId = ID.createEntityId();
  const typesRelationEntityId = ID.createEntityId();

  storage.entities.name.set(tabEntityId, spaceId, tabTitle);

  storage.relations.set({
    id: tabsRelationId,
    entityId: tabsRelationEntityId,
    spaceId,
    renderableType: 'RELATION',
    verified: false,
    position: Position.generateBetween(lastPosition ?? null, null),
    type: {
      id: SystemIds.TABS_PROPERTY,
      name: 'Tabs',
    },
    fromEntity: {
      id: profileEntityId,
      name: null,
    },
    toEntity: {
      id: tabEntityId,
      name: tabTitle,
      value: tabEntityId,
    },
  });

  storage.relations.set({
    id: typesRelationId,
    entityId: typesRelationEntityId,
    spaceId,
    renderableType: 'RELATION',
    verified: false,
    position: Position.generate(),
    type: {
      id: SystemIds.TYPES_PROPERTY,
      name: 'Types',
    },
    fromEntity: {
      id: tabEntityId,
      name: null,
    },
    toEntity: {
      id: SystemIds.PAGE_TYPE,
      name: 'Page',
      value: SystemIds.PAGE_TYPE,
    },
  });

  return tabEntityId;
}

/**
 * Returns an existing profile page tab whose display name matches `tabTitle` (case-insensitive),
 * or creates a new Page tab at the end of the tab strip.
 */
export function ensureProfilePageTab(profileEntityId: string, spaceId: string, tabTitle: string): string {
  const normalized = tabTitle.trim();
  if (!normalized) {
    throw new Error('ensureProfilePageTab: tabTitle is required');
  }

  const needle = normalized.toLowerCase();
  const tabRels = sortRelations(
    getRelations({
      selector: r =>
        r.fromEntity.id === profileEntityId &&
        r.type.id === SystemIds.TABS_PROPERTY &&
        r.spaceId === spaceId &&
        !r.isDeleted,
    })
  );

  for (const r of tabRels) {
    const tid = r.toEntity.id;
    const label = tabEntityName(tid, spaceId) ?? r.toEntity.name ?? '';
    if (label.trim().toLowerCase() === needle) {
      return tid;
    }
  }

  const lastTabPosition = tabRels.length > 0 ? (tabRels[tabRels.length - 1]?.position ?? null) : null;
  return createProfilePageTabAtEnd(profileEntityId, spaceId, normalized, lastTabPosition);
}

async function nextBlocksPosition(parentEntityId: string, spaceId: string): Promise<string> {
  const parent = await E.findOne({ id: parentEntityId, spaceId, store, cache: queryClient });
  const existing = (parent?.relations ?? []).filter(
    r => r.fromEntity.id === parentEntityId && r.type.id === SystemIds.BLOCKS && !r.isDeleted
  );
  const positions = existing
    .map(r => r.position)
    .filter((p): p is string => typeof p === 'string' && p.length > 0)
    .sort();
  const last = positions[positions.length - 1] ?? null;
  return Position.generateBetween(last, null);
}

async function appendQueryPostsDataBlock(
  tabEntityId: string,
  spaceId: string,
  profileEntityId: string,
  authorName: string,
  authorsPropertyId: string
) {
  const blockId = IdUtils.generate();
  const blockRelationEntityId = IdUtils.generate();

  storage.relations.set(makeRelationForSourceType('SPACES', blockId, spaceId));
  storage.relations.set(getRelationForBlockType(blockId, SystemIds.DATA_BLOCK, spaceId));
  storage.entities.name.set(blockId, spaceId, 'Posts');

  const filters: Filter[] = [
    {
      columnId: SystemIds.SPACE_FILTER,
      columnName: 'Space',
      valueType: 'RELATION',
      value: spaceId,
      valueName: null,
    },
    {
      columnId: SystemIds.TYPES_PROPERTY,
      columnName: 'Types',
      valueType: 'RELATION',
      value: SystemIds.POST_TYPE,
      valueName: 'Post',
    },
    {
      columnId: authorsPropertyId,
      columnName: 'Authors',
      valueType: 'RELATION',
      value: profileEntityId,
      valueName: authorName,
    },
  ];

  const filterString = toGeoFilterState(filters, 'AND');

  storage.values.set({
    id: ID.createValueId({
      entityId: blockId,
      propertyId: SystemIds.FILTER,
      spaceId,
    }),
    spaceId,
    entity: { id: blockId, name: 'Posts' },
    property: { id: SystemIds.FILTER, name: 'Filter', dataType: 'TEXT' },
    value: filterString,
  });

  const position = await nextBlocksPosition(tabEntityId, spaceId);

  const blocksRelation: Relation = {
    id: IdUtils.generate(),
    entityId: blockRelationEntityId,
    spaceId,
    position,
    verified: false,
    renderableType: 'DATA',
    type: { id: SystemIds.BLOCKS, name: 'Blocks' },
    fromEntity: { id: tabEntityId, name: null },
    toEntity: { id: blockId, name: 'Posts', value: blockId },
  };
  storage.relations.set(blocksRelation);

  storage.relations.set({
    id: IdUtils.generate(),
    entityId: IdUtils.generate(),
    spaceId,
    position: Position.generate(),
    renderableType: 'RELATION',
    type: { id: SystemIds.VIEW_PROPERTY, name: 'View' },
    fromEntity: { id: blockRelationEntityId, name: null },
    toEntity: { id: SystemIds.TABLE_VIEW, name: 'Table', value: SystemIds.TABLE_VIEW },
  });
}

function setPostTypeAndAuthors(
  postEntityId: string,
  spaceId: string,
  profileEntityId: string,
  authorName: string,
  authorsPropertyId: string
) {
  const typeRelId = IdUtils.generate();
  const typeRelEntityId = IdUtils.generate();
  storage.relations.set({
    id: typeRelId,
    entityId: typeRelEntityId,
    spaceId,
    renderableType: 'RELATION',
    verified: false,
    position: Position.generate(),
    type: { id: SystemIds.TYPES_PROPERTY, name: 'Types' },
    fromEntity: { id: postEntityId, name: null },
    toEntity: { id: SystemIds.POST_TYPE, name: 'Post', value: SystemIds.POST_TYPE },
  });

  const authRelId = IdUtils.generate();
  const authRelEntityId = IdUtils.generate();
  storage.relations.set({
    id: authRelId,
    entityId: authRelEntityId,
    spaceId,
    renderableType: 'RELATION',
    verified: false,
    position: Position.generate(),
    type: { id: authorsPropertyId, name: 'Authors' },
    fromEntity: { id: postEntityId, name: null },
    toEntity: { id: profileEntityId, name: authorName, value: profileEntityId },
  });
}

export async function runPersonalPostCreationFlow(args: PersonalPostFlowArgs): Promise<string> {
  const { spaceId, profileEntityId, authorDisplayName } = args;
  const postEntityId = IdUtils.generate();

  let schema: Property[] = [];
  try {
    schema = await getSchemaFromTypeIds([{ id: SystemIds.POST_TYPE }], [spaceId]);
  } catch {
    schema = [];
  }

  const authorsProperty = pickAuthorsProperty(schema);
  if (!authorsProperty) {
    throw new Error('[PersonalPostFlow] Missing "Authors" relation property for Post type in this space');
  }

  storage.entities.name.set(postEntityId, spaceId, 'My first post');

  setPostTypeAndAuthors(postEntityId, spaceId, profileEntityId, authorDisplayName, authorsProperty.id);

  const publishProp = pickPublishDateProperty(schema);
  if (publishProp) {
    storage.values.set({
      id: ID.createValueId({
        entityId: postEntityId,
        propertyId: publishProp.id,
        spaceId,
      }),
      spaceId,
      entity: { id: postEntityId, name: null },
      property: {
        id: publishProp.id,
        name: publishProp.name,
        dataType: publishProp.dataType,
        renderableType: publishProp.renderableType,
      },
      value: initialPublishDateValue(publishProp.dataType),
    });
  }

  const postsTabEntityId = ensureProfilePageTab(profileEntityId, spaceId, 'Posts');

  if (!postsQueryBlockExists(postsTabEntityId, spaceId)) {
    await appendQueryPostsDataBlock(postsTabEntityId, spaceId, profileEntityId, authorDisplayName, authorsProperty.id);
  }

  return postEntityId;
}
