import { SystemIds } from '@graphprotocol/grc-20';
import { redirect } from 'next/navigation';

import * as React from 'react';

import { Metadata } from 'next';

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

export async function generateMetadata(props: Props): Promise<Metadata> {
  const params = await props.params;
  const spaceId = params.id;
  const entityId = params.entityId;

  // @TODO(migration). Need a "fetch metadata" call instead
  // const entity = await cachedFetchEntity(entityId);
  const entity = null;
  const { entityName, description, openGraphImageUrl } = getOpenGraphMetadataForEntity(entity);
  const title = entityName ?? 'Entity';

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
  const entityId = params.entityId;
  const { children } = props;
  const types = await cachedFetchEntityType(entityId);
  const typeIds = types.map(t => t.id);

  // if (!typeIds.includes(SystemIds.PERSON_TYPE)) {
  return <>{children}</>;
  // }

  // const profile = await getProfilePage(entityId);
  return null;

  // return (
  //   <EntityStoreProvider
  //     id={entityId}
  //     spaceId={params.id}
  //     initialSpaces={profile.spaces}
  //     initialValues={profile.values}
  //     initialRelations={profile.relations}
  //   >
  //     <EditorProvider
  //       id={profile.id}
  //       spaceId={params.id}
  //       initialBlocks={profile.blocks}
  //       initialBlockRelations={profile.blockRelations}
  //     >
  //       <EntityPageCover avatarUrl={profile.avatarUrl} coverUrl={profile.coverUrl} />
  //       <EntityPageContentContainer>
  //         <div className="space-y-2">
  //           <EditableHeading spaceId={params.id} entityId={entityId} />
  //           <EntityPageMetadataHeader id={profile.id} spaceId={params.id} />
  //         </div>

  //         <Spacer height={40} />
  //         <React.Suspense fallback={null}>
  //           <TabGroup
  //             tabs={TABS.map(label => {
  //               const href =
  //                 label === 'Overview'
  //                   ? `${NavUtils.toEntity(params.id, entityId)}`
  //                   : `${NavUtils.toEntity(params.id, entityId)}/${label.toLowerCase()}`;
  //               return {
  //                 href,
  //                 label,
  //               };
  //             })}
  //           />
  //         </React.Suspense>

  //         <Spacer height={20} />

  //         {children}
  //       </EntityPageContentContainer>
  //     </EditorProvider>
  //   </EntityStoreProvider>
  // );
}

// async function getProfilePage(entityId: string): Promise<
//   Entity & {
//     avatarUrl: string | null;
//     coverUrl: string | null;
//     blocks: Entity[];
//     blockRelations: Relation[];
//   }
// > {
//   const person = await cachedFetchEntity(entityId);

//   // @TODO: Real error handling
//   if (!person) {
//     return {
//       id: entityId,
//       name: null,
//       spaces: [],
//       avatarUrl: null,
//       coverUrl: null,
//       values: [],
//       types: [],
//       description: null,
//       relations: [],
//       blocks: [],
//       blockRelations: [],
//     };
//   }

//   const blockRelations = person?.relations.filter(r => r.type.id === SystemIds.BLOCKS);
//   const blockIds = blockRelations?.map(r => r.toEntity.id);
//   const blocks = blockIds ? await cachedFetchEntitiesBatch(blockIds) : [];

//   return {
//     ...person,
//     avatarUrl: Entities.avatar(person.relations),
//     coverUrl: Entities.cover(person.relations),
//     blockRelations: blockRelations,
//     blocks,
//   };
// }
