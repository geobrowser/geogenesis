import { redirect } from 'next/navigation';

import * as React from 'react';

import type { Metadata } from 'next';

import { AppConfig, Environment } from '~/core/environment';
import { API, Subgraph } from '~/core/io';
import { fetchSubspaces } from '~/core/io/subgraph/fetch-subspaces';
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

import { SpaceLayout } from './space-layout';

interface Props {
  params: { id: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const spaceId = params.id;
  let config = Environment.getConfig(process.env.NEXT_PUBLIC_APP_ENV);

  const { isPermissionlessSpace, space } = await API.space(params.id);

  if (isPermissionlessSpace) {
    config = {
      ...config,
      subgraph: config.permissionlessSubgraph,
    };
  }

  const entityId = space?.spaceConfigEntityId;

  if (!entityId) {
    console.log(`Redirecting to /space/${spaceId}/entities`);
    return redirect(`/space/${spaceId}/entities`);
  }

  const entity = await Subgraph.fetchEntity({ endpoint: config.subgraph, id: entityId });
  const { entityName, description, openGraphImageUrl } = getOpenGraphMetadataForEntity(entity);

  return {
    title: entityName ?? spaceId,
    description,
    openGraph: {
      title: entityName ?? spaceId,
      description,
      url: `https://geobrowser.io${NavUtils.toEntity(spaceId, entityId)}`,
      images: [
        {
          url: openGraphImageUrl,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      description,
      images: [
        {
          url: openGraphImageUrl,
        },
      ],
    },
  };
}

export default async function SpacePage({ params }: Props) {
  let config = Environment.getConfig(process.env.NEXT_PUBLIC_APP_ENV);

  const { isPermissionlessSpace } = await API.space(params.id);

  if (isPermissionlessSpace) {
    config = {
      ...config,
      subgraph: config.permissionlessSubgraph,
    };
  }

  const props = await getData(params.id, config);

  return (
    <SpaceLayout params={params} usePermissionlessSpace={isPermissionlessSpace}>
      <React.Suspense fallback={<SubspacesSkeleton />}>
        <SubspacesContainer entityId={props.id} />
      </React.Suspense>
      <Editor shouldHandleOwnSpacing />
      <ToggleEntityPage {...props} />
      <Spacer height={40} />
      <React.Suspense fallback={<EntityReferencedByLoading />}>
        <EntityReferencedByServerContainer entityId={props.id} name={props.name} spaceId={params.id} />
      </React.Suspense>
    </SpaceLayout>
  );
}

const SubspacesSkeleton = () => {
  return (
    <>
      <div className="h-10" />
      <div className="no-scrollbar grid grid-cols-3 gap-8 overflow-x-scroll xl:grid-cols-2" aria-hidden>
        <div>
          <Skeleton className="aspect-video w-full" />
          <div className="mt-2 text-metadataMedium text-text opacity-0">
            Need a placeholder that wraps around to two lines.
          </div>
        </div>
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
  const config = Environment.getConfig(process.env.NEXT_PUBLIC_APP_ENV);
  const subspaces = await fetchSubspaces({ entityId, endpoint: config.subgraph });

  return <Subspaces subspaces={subspaces} />;
};

const getData = async (spaceId: string, config: AppConfig) => {
  const { isPermissionlessSpace, space } = await API.space(spaceId);

  if (isPermissionlessSpace) {
    config = {
      ...config,
      subgraph: config.permissionlessSubgraph,
    };
  }

  const entityId = space?.spaceConfigEntityId;

  if (!entityId) {
    console.log(`Redirecting to /space/${spaceId}/entities`);
    redirect(`/space/${spaceId}/entities`);
  }

  const entity = await Subgraph.fetchEntity({ endpoint: config.subgraph, id: entityId });

  // @HACK: Entities we are rendering might be in a different space. Right now there's a bug where we aren't
  // fetching the space for the entity we are rendering, so we need to redirect to the correct space.
  if (entity?.nameTripleSpace) {
    if (spaceId !== entity?.nameTripleSpace) {
      console.log('Redirecting to space from space configuration entity', entity?.nameTripleSpace);
      redirect(`/space/${entity?.nameTripleSpace}/${entityId}`);
    }
  }

  return {
    name: entity?.name ?? null,
    triples: entity?.triples ?? [],
    id: entityId,
    spaceId,
  };
};
