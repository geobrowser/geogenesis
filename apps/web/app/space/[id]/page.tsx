import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import * as React from 'react';

import type { Metadata } from 'next';

import { AppConfig } from '~/core/environment';
import { Subgraph } from '~/core/io';
import { Params } from '~/core/params';
import { ServerSideEnvParams } from '~/core/types';
import { NavUtils, getOpenGraphMetadataForEntity } from '~/core/utils/utils';

import { Spacer } from '~/design-system/spacer';

import { Editor } from '~/partials/editor/editor';
import {
  EntityReferencedByLoading,
  EntityReferencedByServerContainer,
} from '~/partials/entity-page/entity-page-referenced-by-server-container';
import { ToggleEntityPage } from '~/partials/entity-page/toggle-entity-page';

import { SpaceLayout } from './space-layout';

export const runtime = 'edge';

interface Props {
  params: { id: string };
  searchParams: ServerSideEnvParams;
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const spaceId = params.id;
  const env = cookies().get(Params.ENV_PARAM_NAME)?.value;
  const config = Params.getConfigFromParams(searchParams, env);

  const space = await Subgraph.fetchSpace({ endpoint: config.subgraph, id: spaceId });
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

export default async function SpacePage({ params, searchParams }: Props) {
  const env = cookies().get(Params.ENV_PARAM_NAME)?.value;

  const config = Params.getConfigFromParams(searchParams, env);

  let space = await Subgraph.fetchSpace({ endpoint: config.subgraph, id: params.id });
  let usePermissionlessSubgraph = false;

  if (!space) {
    space = await Subgraph.fetchSpace({ endpoint: config.permissionlessSubgraph, id: params.id });
    if (space) usePermissionlessSubgraph = true;
  }

  if (usePermissionlessSubgraph) {
    config.subgraph = config.permissionlessSubgraph;
  }

  const props = await getData(params.id, config);

  return (
    // @ts-expect-error async JSX function
    <SpaceLayout params={params} searchParams={searchParams} usePermissionlessSpace={usePermissionlessSubgraph}>
      <Editor shouldHandleOwnSpacing />
      <ToggleEntityPage {...props} />
      <Spacer height={40} />
      <React.Suspense fallback={<EntityReferencedByLoading />}>
        {/* @ts-expect-error async JSX function */}
        <EntityReferencedByServerContainer entityId={props.id} name={props.name} searchParams={searchParams} />
      </React.Suspense>
    </SpaceLayout>
  );
}

const getData = async (spaceId: string, config: AppConfig) => {
  // Attempt to fetch the space from the public subgraph first. If the space doesn't exist there, try the permissionless subgraph.
  let space = await Subgraph.fetchSpace({ endpoint: config.subgraph, id: spaceId });

  if (!space) {
    space = await Subgraph.fetchSpace({ endpoint: config.permissionlessSubgraph, id: spaceId });
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
    triples: entity?.triples ?? [],
    id: entityId,
    spaceId,
  };
};
