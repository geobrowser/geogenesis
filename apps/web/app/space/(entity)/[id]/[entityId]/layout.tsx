import { SYSTEM_IDS } from '@geogenesis/sdk';

import * as React from 'react';

import { Metadata } from 'next';

import { Entity } from '~/core/io/dto/entities';
import { fetchBlocks } from '~/core/io/fetch-blocks';
import { EntityId, TypeId } from '~/core/io/schema';
import { EditorProvider } from '~/core/state/editor/editor-provider';
import { EntityStoreProvider } from '~/core/state/entity-page-store/entity-store-provider';
import { Relation } from '~/core/types';
import { Entities } from '~/core/utils/entity';
import { NavUtils, getOpenGraphMetadataForEntity } from '~/core/utils/utils';

import { Spacer } from '~/design-system/spacer';
import { TabGroup } from '~/design-system/tab-group';

import { EditableHeading } from '~/partials/entity-page/editable-entity-header';
import { EntityPageContentContainer } from '~/partials/entity-page/entity-page-content-container';
import { EntityPageCover } from '~/partials/entity-page/entity-page-cover';
import { EntityPageMetadataHeader } from '~/partials/entity-page/entity-page-metadata-header';

import { cachedFetchEntityType } from './cached-entity-type';
import { cachedFetchEntity } from './cached-fetch-entity';

const TABS = ['Overview', 'Activity'] as const;

interface Props {
  params: { id: string; entityId: string };
  children: React.ReactNode;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const spaceId = params.id;
  const entityId = params.entityId;

  const entity = await cachedFetchEntity(entityId);
  const { entityName, description, openGraphImageUrl } = getOpenGraphMetadataForEntity(entity);

  return {
    title: entityName ?? 'New entity',
    description,
    openGraph: {
      title: entityName ?? 'New entity',
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

export default async function ProfileLayout({ children, params }: Props) {
  const entityId = params.entityId;

  const types = await cachedFetchEntityType(entityId);

  if (!types.includes(TypeId(SYSTEM_IDS.PERSON_TYPE))) {
    return <>{children}</>;
  }

  const profile = await getProfilePage(entityId);

  return (
    <EntityStoreProvider
      id={entityId}
      spaceId={params.id}
      initialSpaces={profile.spaces}
      initialTriples={profile.triples}
      initialRelations={profile.relationsOut}
    >
      <EditorProvider
        id={profile.id}
        spaceId={params.id}
        initialBlocks={profile.blocks}
        initialBlockRelations={profile.blockRelations}
      >
        <EntityPageCover avatarUrl={profile.avatarUrl} coverUrl={profile.coverUrl} />
        <EntityPageContentContainer>
          <EditableHeading spaceId={params.id} entityId={entityId} />
          <EntityPageMetadataHeader id={profile.id} spaceId={params.id} />

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
      nameTripleSpaces: [],
      spaces: [],
      avatarUrl: null,
      coverUrl: null,
      triples: [],
      types: [],
      description: null,
      relationsOut: [],
      blocks: [],
      blockRelations: [],
    };
  }

  const blockIds = person?.relationsOut
    .filter(r => r.typeOf.id === EntityId(SYSTEM_IDS.BLOCKS))
    ?.map(r => r.toEntity.id);

  const blocks = blockIds ? await fetchBlocks(blockIds) : [];

  return {
    ...person,
    avatarUrl: Entities.avatar(person.relationsOut),
    coverUrl: Entities.cover(person.relationsOut),

    relationsOut: [],
    blockRelations: person.relationsOut,
    blocks,
  };
}
