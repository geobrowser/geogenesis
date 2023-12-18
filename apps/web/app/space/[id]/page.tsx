import { SYSTEM_IDS } from '@geogenesis/ids';
import { redirect } from 'next/navigation';

import * as React from 'react';

import type { Metadata } from 'next';

import { Subgraph } from '~/core/io';
import { fetchEntities } from '~/core/io/subgraph';
import { NavUtils, getOpenGraphMetadataForEntity } from '~/core/utils/utils';

import { Skeleton } from '~/design-system/skeleton';
import { Spacer } from '~/design-system/spacer';

import { Editor } from '~/partials/editor/editor';
import {
  EntityReferencedByLoading,
  EntityReferencedByServerContainer,
} from '~/partials/entity-page/entity-page-referenced-by-server-container';
import { ToggleEntityPage } from '~/partials/entity-page/toggle-entity-page';
import { Subspaces } from '~/partials/space-page/subspaces';

interface Props {
  params: { id: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const spaceId = params.id;

  const space = await Subgraph.fetchSpace({ id: spaceId });
  const entity = space?.spaceConfig;

  if (!entity) {
    console.log(`Redirecting to /space/${spaceId}/entities`);
    redirect(`/space/${spaceId}/entities`);
  }

  const { entityName, description, openGraphImageUrl } = getOpenGraphMetadataForEntity(entity);

  return {
    title: entityName ?? spaceId,
    description,
    openGraph: {
      title: entityName ?? spaceId,
      description: description ?? undefined,
      url: `https://geobrowser.io${NavUtils.toEntity(spaceId, entity.id)}`,
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

export default async function SpacePage({ params }: Props) {
  const props = await getData(params.id);

  return (
    <>
      <React.Suspense fallback={<SubspacesSkeleton />}>
        <SubspacesContainer entityId={props.id} />
      </React.Suspense>
      <Editor shouldHandleOwnSpacing />
      <ToggleEntityPage {...props} />
      <Spacer height={40} />
      <React.Suspense fallback={<EntityReferencedByLoading />}>
        <EntityReferencedByServerContainer entityId={props.id} name={props.name} spaceId={params.id} />
      </React.Suspense>
    </>
  );
}

const SubspacesSkeleton = () => {
  return (
    <>
      <div className="h-10" />
      <div className="no-scrollbar grid grid-cols-3 gap-8 overflow-x-scroll xl:grid-cols-2" aria-hidden>
        <Skeleton className="aspect-video w-full" />
        <Skeleton className="aspect-video w-full" />
        <Skeleton className="aspect-video w-full xl:hidden" />
      </div>
      <Spacer height={40} />
    </>
  );
};

type SubspacesContainerProps = {
  entityId: string;
};

const SubspacesContainer = async ({ entityId }: SubspacesContainerProps) => {
  const subspaces = await fetchEntities({
    typeIds: [SYSTEM_IDS.SPACE_CONFIGURATION],
    filter: [
      {
        field: 'attribute-id',
        value: SYSTEM_IDS.BROADER_SPACES,
      },
      {
        field: 'linked-to',
        value: entityId,
      },
    ],
  });

  return <Subspaces subspaces={subspaces} />;
};

const getData = async (spaceId: string) => {
  const space = await Subgraph.fetchSpace({ id: spaceId });
  const entity = space?.spaceConfig;

  if (!entity) {
    console.log(`Redirecting to /space/${spaceId}/entities`);
    redirect(`/space/${spaceId}/entities`);
  }

  // @HACK: Entities we are rendering might be in a different space. Right now there's a bug where we aren't
  // fetching the space for the entity we are rendering, so we need to redirect to the correct space.
  if (entity?.nameTripleSpace) {
    if (spaceId !== entity?.nameTripleSpace) {
      console.log('Redirecting to space from space configuration entity', entity?.nameTripleSpace);
      redirect(`/space/${entity?.nameTripleSpace}/${entity.id}`);
    }
  }

  return {
    name: entity?.name ?? null,
    triples: entity?.triples ?? [],
    id: entity.id,
    spaceId,
  };
};
