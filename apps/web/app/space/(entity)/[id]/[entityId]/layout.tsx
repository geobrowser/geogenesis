import { IdUtils, SystemIds } from '@geoprotocol/geo-sdk';
import { notFound } from 'next/navigation';

import * as React from 'react';

import { Metadata } from 'next';

import { firstLine } from '~/core/opengraph';
import { EditorProvider } from '~/core/state/editor/editor-provider';
import { EntityStoreProvider } from '~/core/state/entity-page-store/entity-store-provider';
import { TabEntity } from '~/core/types';
import { Entity, Relation } from '~/core/types';
import { Entities } from '~/core/utils/entity';
import { sortRelations } from '~/core/utils/utils';

import { Spacer } from '~/design-system/spacer';

import { EditableHeading } from '~/partials/entity-page/editable-entity-header';
import { EntityPageContentContainer } from '~/partials/entity-page/entity-page-content-container';
import { EntityPageCover } from '~/partials/entity-page/entity-page-cover';
import { EntityPageMetadataHeader } from '~/partials/entity-page/entity-page-metadata-header';
import { EntityTabs } from '~/partials/entity-page/entity-tabs';

import { cachedFetchEntitiesBatch, cachedFetchEntity, cachedFetchEntityPage } from './cached-fetch-entity';

interface Props {
  params: Promise<{ id: string; entityId: string }>;
  children: React.ReactNode;
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const params = await props.params;
  const spaceId = params.id;
  const entityId = params.entityId;

  if (!IdUtils.isValid(spaceId) || !IdUtils.isValid(entityId)) {
    return { title: 'Not Found' };
  }

  const result = await cachedFetchEntityPage(entityId, params.id);

  const entity = result?.entity ?? null;
  const title = entity?.name ?? 'Entity';
  const description = firstLine(Entities.description(entity?.values ?? []));

  return {
    title,
    description,
  };
}

export default async function ProfileLayout(props: Props) {
  const params = await props.params;
  const entityId = params.entityId;
  const spaceId = params.id;

  if (!IdUtils.isValid(spaceId) || !IdUtils.isValid(entityId)) {
    notFound();
  }

  const { children } = props;
  const result = await cachedFetchEntityPage(entityId, spaceId);
  const typeIds = result?.entity?.types.map(t => t.id) ?? [];

  if (!typeIds.includes(SystemIds.PERSON_TYPE)) {
    return <>{children}</>;
  }

  const profile = await getProfilePage(entityId, spaceId);

  return (
    <EntityStoreProvider id={entityId} spaceId={spaceId}>
      <EditorProvider
        id={profile.id}
        spaceId={spaceId}
        initialBlocks={profile.blocks}
        initialBlockRelations={profile.blockRelations}
      >
        <EntityPageCover avatarUrl={profile.avatarUrl} coverUrl={profile.coverUrl} />
        <EntityPageContentContainer>
          <div className="space-y-2">
            <EditableHeading spaceId={spaceId} entityId={entityId} />
            <EntityPageMetadataHeader id={profile.id} spaceId={spaceId} />
          </div>

          <Spacer height={40} />
          <React.Suspense fallback={null}>
            <EntityTabs
              entityId={entityId}
              spaceId={spaceId}
              initialTabRelations={profile.tabRelations}
              tabEntities={profile.tabEntities}
            />
          </React.Suspense>

          <Spacer height={20} />

          {children}
        </EntityPageContentContainer>
      </EditorProvider>
    </EntityStoreProvider>
  );
}

async function getProfilePage(
  entityId: string,
  spaceId: string
): Promise<{
  id: string;
  spaces: string[];
  types: string[];
  avatarUrl: string | null;
  coverUrl: string | null;
  blocks: Entity[];
  blockRelations: Relation[];
  tabEntities: TabEntity[];
  tabRelations: Relation[];
}> {
  const person = await cachedFetchEntity(entityId, spaceId);

  // @TODO: Real error handling
  if (!person) {
    return {
      id: entityId,
      spaces: [],
      avatarUrl: null,
      coverUrl: null,
      types: [],
      blocks: [],
      blockRelations: [],
      tabEntities: [],
      tabRelations: [],
    };
  }

  const blockRelations = person?.relations.filter(r => r.type.id === SystemIds.BLOCKS);
  const blockIds = blockRelations?.map(r => r.toEntity.id);
  const blocks = blockIds ? await cachedFetchEntitiesBatch(blockIds) : [];

  // Fetch tab relations and entities
  const tabRelations = person?.relations.filter(r => r.type.id === SystemIds.TABS_PROPERTY) ?? [];
  const tabIds = sortRelations(tabRelations).map(r => r.toEntity.id);

  const fetchedTabEntities = tabIds.length > 0 ? await cachedFetchEntitiesBatch(tabIds, spaceId) : [];

  // Re-order entities to match the sorted tabIds order
  const tabEntityMap = new Map(fetchedTabEntities.map(e => [e.id, e]));
  const tabEntities: TabEntity[] = tabIds
    .map(id => tabEntityMap.get(id))
    .filter((e): e is Entity => e != null)
    .map(e => ({ id: e.id, name: e.name }));

  return {
    ...person,
    types: person.types.map(t => t.id),
    avatarUrl: Entities.avatar(person.relations),
    coverUrl: Entities.cover(person.relations),
    blockRelations: blockRelations,
    blocks,
    tabEntities,
    tabRelations,
  };
}
