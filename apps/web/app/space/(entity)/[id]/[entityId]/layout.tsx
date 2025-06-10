import { SystemIds } from '@graphprotocol/grc-20';

import * as React from 'react';

import { Metadata } from 'next';

import { EntityId, TypeId } from '~/core/io/schema';
import { EditorProvider } from '~/core/state/editor/editor-provider';
import { EntityStoreProvider } from '~/core/state/entity-page-store/entity-store-provider';
import { Entities } from '~/core/utils/entity';
import { NavUtils, getOpenGraphMetadataForEntity } from '~/core/utils/utils';
import { Entity, Relation } from '~/core/v2.types';

import { Spacer } from '~/design-system/spacer';
import { TabGroup } from '~/design-system/tab-group';

import { EditableHeading } from '~/partials/entity-page/editable-entity-header';
import { EntityPageContentContainer } from '~/partials/entity-page/entity-page-content-container';
import { EntityPageCover } from '~/partials/entity-page/entity-page-cover';
import { EntityPageMetadataHeader } from '~/partials/entity-page/entity-page-metadata-header';

import { cachedFetchEntityType } from './cached-entity-type';
import { cachedFetchEntitiesBatch, cachedFetchEntity } from './cached-fetch-entity';

const TABS = ['Overview', 'Activity'] as const;

interface Props {
  params: Promise<{ id: string; entityId: string }>;
  children: React.ReactNode;
}

async function getTitleForRelation(entity: Entity | null): Promise<string | null> {
  // const maybeRelation = entity?.values.find(t => t.property.id === SystemIds.TYPES_ATTRIBUTE);
  // const maybeType = maybeRelation?.value;

  // if (
  //   maybeRelation?.value.type === 'URL' &&
  //   maybeType &&
  //   SystemIds.RELATION_TYPE === GraphUrl.toEntityId(maybeType as GraphUri)
  // ) {
  //   const maybeFrom = entity?.triples.find(t => t.attributeId === SystemIds.RELATION_FROM_ATTRIBUTE);
  //   const maybeTo = entity?.triples.find(t => t.attributeId === SystemIds.RELATION_TO_ATTRIBUTE);

  //   if (maybeFrom?.value.type === 'URL' && maybeTo?.value.type === 'URL') {
  //     const [maybeFromEntity, maybeToEntity] = await Promise.all([
  //       cachedFetchEntity(GraphUrl.toEntityId(maybeFrom.value.value as GraphUri)),
  //       cachedFetchEntity(GraphUrl.toEntityId(maybeTo.value.value as GraphUri)),
  //     ]);

  //     if (maybeFromEntity && maybeToEntity) {
  //       return `${maybeFromEntity.name ?? maybeFromEntity.id} → ${maybeToEntity.name ?? maybeToEntity.id}`;
  //     }
  //   }
  // }

  return null;
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const params = await props.params;
  const spaceId = params.id;
  const entityId = params.entityId;

  const entity = await cachedFetchEntity(entityId);
  const { entityName, description, openGraphImageUrl } = getOpenGraphMetadataForEntity(entity);
  const title = (await getTitleForRelation(entity)) ?? entityName ?? 'New entity';

  return {
    title,
    description,
    openGraph: {
      title,
      description: description ?? undefined,
      url: `https://geobrowser.io${NavUtils.toEntity(spaceId, entityId)}`,
      images: openGraphImageUrl
        ? [
            {
              url: openGraphImageUrl,
            },
          ]
        : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      description: description ?? undefined,
      images: openGraphImageUrl
        ? [
            {
              url: openGraphImageUrl,
            },
          ]
        : undefined,
    },
  };
}

export default async function ProfileLayout(props: Props) {
  const params = await props.params;

  const { children } = props;

  const entityId = params.entityId;

  const types = await cachedFetchEntityType(entityId);

  if (!types.map(t => t.id).includes(SystemIds.PERSON_TYPE)) {
    return <>{children}</>;
  }

  const profile = await getProfilePage(entityId);

  return (
    <EntityStoreProvider
      id={entityId}
      spaceId={params.id}
      initialSpaces={profile.spaces}
      initialValues={profile.values}
      initialRelations={profile.relations}
    >
      <EditorProvider
        id={profile.id}
        spaceId={params.id}
        initialBlocks={profile.blocks}
        initialBlockRelations={profile.blockRelations}
      >
        <EntityPageCover avatarUrl={profile.avatarUrl} coverUrl={profile.coverUrl} />
        <EntityPageContentContainer>
          <div className="space-y-2">
            <EditableHeading spaceId={params.id} entityId={entityId} />
            <EntityPageMetadataHeader id={profile.id} spaceId={params.id} />
          </div>

          <Spacer height={40} />
          <React.Suspense fallback={null}>
            <TabGroup
              tabs={TABS.map(label => {
                const href =
                  label === 'Overview'
                    ? `${NavUtils.toEntity(params.id, entityId)}`
                    : `${NavUtils.toEntity(params.id, entityId)}/${label.toLowerCase()}`;
                return {
                  href,
                  label,
                };
              })}
            />
          </React.Suspense>

          <Spacer height={20} />

          {children}
        </EntityPageContentContainer>
      </EditorProvider>
    </EntityStoreProvider>
  );
}

async function getProfilePage(entityId: string): Promise<
  Entity & {
    avatarUrl: string | null;
    coverUrl: string | null;
    blocks: Entity[];
    blockRelations: Relation[];
  }
> {
  const person = await cachedFetchEntity(entityId);

  // @TODO: Real error handling
  if (!person) {
    return {
      id: EntityId(entityId),
      name: null,
      spaces: [],
      avatarUrl: null,
      coverUrl: null,
      values: [],
      types: [],
      description: null,
      relations: [],
      blocks: [],
      blockRelations: [],
    };
  }

  const blockRelations = person?.relations.filter(r => r.type.id === EntityId(SystemIds.BLOCKS));
  const blockIds = blockRelations?.map(r => r.toEntity.id);
  const blocks = blockIds ? await cachedFetchEntitiesBatch(blockIds) : [];

  return {
    ...person,
    avatarUrl: Entities.avatar(person.relations),
    coverUrl: Entities.cover(person.relations),
    blockRelations: blockRelations,
    blocks,
  };
}
