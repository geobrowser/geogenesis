import { SYSTEM_IDS } from '@geogenesis/ids';

import * as React from 'react';

import { Metadata } from 'next';

import { EditorProvider } from '~/core/state/editor-store';
import { EntityStoreProvider } from '~/core/state/entity-page-store/entity-store-provider';
import { TypesStoreServerContainer } from '~/core/state/types-store/types-store-server-container';
import { Entity as IEntity, Triple } from '~/core/types';
import { Entity } from '~/core/utils/entity';
import { NavUtils, getOpenGraphMetadataForEntity } from '~/core/utils/utils';
import { Value } from '~/core/utils/value';

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
  const entityId = decodeURIComponent(params.entityId);

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
  const decodedId = decodeURIComponent(params.entityId);

  const types = await cachedFetchEntityType(decodedId);

  if (!types.includes(SYSTEM_IDS.PERSON_TYPE)) {
    return <TypesStoreServerContainer spaceId={params.id}>{children}</TypesStoreServerContainer>;
  }

  const profile = await getProfilePage(decodedId);

  return (
    <TypesStoreServerContainer spaceId={params.id}>
      <EntityStoreProvider id={decodedId} spaceId={params.id} initialTriples={profile.triples}>
        <EditorProvider
          id={profile.id}
          spaceId={params.id}
          initialBlockIdsTriple={profile.blockIdsTriple}
          initialBlockTriples={profile.blockTriples}
        >
          <EntityPageCover avatarUrl={profile.avatarUrl} coverUrl={profile.coverUrl} />
          <EntityPageContentContainer>
            <EditableHeading
              spaceId={params.id}
              entityId={decodedId}
              name={profile.name ?? decodedId}
              triples={profile.triples}
            />
            <EntityPageMetadataHeader id={profile.id} spaceId={params.id} types={profile.types} />

            <Spacer height={40} />
            <TabGroup
              tabs={TABS.map(label => {
                const href =
                  label === 'Overview'
                    ? decodeURIComponent(`${NavUtils.toEntity(params.id, decodedId)}`)
                    : decodeURIComponent(`${NavUtils.toEntity(params.id, decodedId)}/${label.toLowerCase()}`);
                return {
                  href,
                  label,
                };
              })}
            />

            <Spacer height={20} />

            {children}
          </EntityPageContentContainer>
        </EditorProvider>
      </EntityStoreProvider>
    </TypesStoreServerContainer>
  );
}

async function getProfilePage(entityId: string): Promise<
  IEntity & {
    avatarUrl: string | null;
    coverUrl: string | null;
    referencedByEntities: ReferencedByEntity[];
    blockTriples: Triple[];
    blockIdsTriple: Triple | null;
  }
> {
  const person = await cachedFetchEntity(entityId);

  // @TODO: Real error handling
  if (!person) {
    return {
      id: entityId,
      name: null,
      avatarUrl: null,
      coverUrl: null,
      triples: [],
      types: [],
      description: null,
      blockTriples: [],
      blockIdsTriple: null,
    };
  }

  const blockIdsTriple = person?.triples.find(t => t.attributeId === SYSTEM_IDS.BLOCKS) || null;
  const blockIds: string[] = blockIdsTriple ? JSON.parse(Value.stringValue(blockIdsTriple) || '[]') : [];

  const blockTriples = (
    await Promise.all(
      blockIds.map(blockId => {
        return cachedFetchEntity(blockId);
      })
    )
  ).flatMap(entity => entity?.triples ?? []);

  return {
    ...person,
    avatarUrl: Entity.avatar(person.triples),
    coverUrl: Entity.cover(person.triples),
    blockTriples,
    blockIdsTriple,
  };
}
